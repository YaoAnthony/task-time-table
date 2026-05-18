const { getDb } = require('./localDatabase');
const { createObjectId } = require('./objectIdCompat');

const modelRegistry = new Map();

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => clone(entry));
  const result = {};
  for (const key of Object.keys(value)) {
    const entry = value[key];
    if (typeof entry !== 'function') result[key] = clone(entry);
  }
  return result;
}

function nowIso() {
  return new Date().toISOString();
}

function deepMerge(base, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return clone(input);
  const result = clone(base || {});
  for (const [key, value] of Object.entries(input)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function getPath(target, path) {
  if (!path) return target;
  return String(path).split('.').reduce((cursor, part) => cursor?.[part], target);
}

function setPath(target, path, value) {
  const parts = String(path).split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function unsetPath(target, path) {
  const parts = String(path).split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor = cursor?.[parts[i]];
    if (!cursor || typeof cursor !== 'object') return;
  }
  delete cursor[parts[parts.length - 1]];
}

function valuesEqual(a, b) {
  if (a == null || b == null) return a == b;
  return String(a) === String(b);
}

function matchesCondition(value, condition) {
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    if ('$in' in condition) {
      const values = Array.isArray(condition.$in) ? condition.$in : [];
      return values.some((entry) => valuesEqual(value, entry));
    }
    if ('$ne' in condition) return !valuesEqual(value, condition.$ne);
    if ('$exists' in condition) return condition.$exists ? value !== undefined : value === undefined;
    return Object.entries(condition).every(([key, nested]) => matchesCondition(value?.[key], nested));
  }
  return valuesEqual(value, condition);
}

function matchesQuery(doc, query = {}) {
  return Object.entries(query || {}).every(([path, condition]) => {
    if (path === '_id') return matchesCondition(doc._id, condition);
    return matchesCondition(getPath(doc, path), condition);
  });
}

function compareBySort(sortSpec = {}) {
  const entries = Object.entries(sortSpec || {});
  return (a, b) => {
    for (const [path, direction] of entries) {
      const av = getPath(a, path);
      const bv = getPath(b, path);
      if (av === bv) continue;
      const multiplier = Number(direction) < 0 ? -1 : 1;
      return av > bv ? multiplier : -multiplier;
    }
    return 0;
  };
}

function parseSelect(spec) {
  if (!spec) return null;
  if (typeof spec === 'object') return spec;
  const parts = String(spec).split(/\s+/).filter(Boolean);
  const hasInclude = parts.some((part) => !part.startsWith('-'));
  const result = { mode: hasInclude ? 'include' : 'exclude', fields: new Set() };
  for (const part of parts) result.fields.add(part.startsWith('-') ? part.slice(1) : part);
  return result;
}

function applySelect(doc, spec) {
  const parsed = parseSelect(spec);
  if (!parsed) return doc;
  const source = clone(doc);
  if (parsed.mode === 'exclude') {
    for (const field of parsed.fields) unsetPath(source, field);
    return source;
  }
  const selected = {};
  if (source._id != null) selected._id = source._id;
  for (const field of parsed.fields) {
    const value = getPath(source, field);
    if (value !== undefined) setPath(selected, field, value);
  }
  return selected;
}

function ensureSubdocumentId(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !value._id) {
    value._id = createObjectId();
  }
}

function stripHelpers(value) {
  return clone(value);
}

function attachArrayHelpers(array) {
  if (!Array.isArray(array) || array.__sqliteHelpersAttached) return array;

  Object.defineProperty(array, '__sqliteHelpersAttached', {
    value: true,
    enumerable: false,
  });

  Object.defineProperty(array, 'id', {
    enumerable: false,
    value(id) {
      return this.find((entry) => valuesEqual(entry?._id, id)) || null;
    },
  });

  Object.defineProperty(array, 'pull', {
    enumerable: false,
    value(target) {
      const targetId = typeof target === 'object' ? target?._id : target;
      for (let i = this.length - 1; i >= 0; i -= 1) {
        if (valuesEqual(this[i]?._id, targetId) || valuesEqual(this[i], target)) this.splice(i, 1);
      }
      return this;
    },
  });

  const nativePush = array.push;
  Object.defineProperty(array, 'push', {
    enumerable: false,
    value(...items) {
      const hydrated = items.map((item) => {
        if (item && typeof item === 'object') ensureSubdocumentId(item);
        return hydrateDocumentValue(item, this);
      });
      return nativePush.apply(this, hydrated);
    },
  });

  return array;
}

function hydrateDocumentValue(value, parentArray = null) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    attachArrayHelpers(value);
    value.forEach((entry, index) => {
      value[index] = hydrateDocumentValue(entry, value);
    });
    return value;
  }

  if (parentArray) {
    Object.defineProperty(value, 'deleteOne', {
      enumerable: false,
      configurable: true,
      value() {
        const index = parentArray.indexOf(value);
        if (index !== -1) parentArray.splice(index, 1);
      },
    });
  }

  Object.keys(value).forEach((key) => {
    value[key] = hydrateDocumentValue(value[key], null);
  });
  return value;
}

function applyDefaults(input, defaults) {
  const base = typeof defaults === 'function' ? defaults() : defaults || {};
  const merged = deepMerge(base, input || {});
  if (!merged._id) merged._id = createObjectId();
  return merged;
}

function prepareForSave(doc, options) {
  const plain = stripHelpers(doc);
  if (!plain._id) plain._id = createObjectId();
  if (options.timestamps) {
    const timestamp = nowIso();
    if (!plain.createdAt) plain.createdAt = timestamp;
    plain.updatedAt = timestamp;
  }
  return plain;
}

function readRows(collection) {
  const rows = getDb()
    .prepare('SELECT data FROM documents WHERE collection = ?')
    .all(collection);
  return rows.map((row) => JSON.parse(row.data));
}

function readOne(collection, id) {
  const row = getDb()
    .prepare('SELECT data FROM documents WHERE collection = ? AND id = ?')
    .get(collection, String(id));
  return row ? JSON.parse(row.data) : null;
}

function writeOne(collection, plain) {
  const timestamp = nowIso();
  const createdAt = plain.createdAt || timestamp;
  const updatedAt = plain.updatedAt || timestamp;
  getDb().prepare(`
    INSERT INTO documents (collection, id, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(collection, id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(collection, String(plain._id), JSON.stringify(plain), createdAt, updatedAt);
}

function deleteMatching(collection, query) {
  const rows = readRows(collection);
  let deleted = 0;
  const statement = getDb().prepare('DELETE FROM documents WHERE collection = ? AND id = ?');
  const tx = getDb().transaction((docs) => {
    for (const doc of docs) {
      if (!matchesQuery(doc, query)) continue;
      statement.run(collection, String(doc._id));
      deleted += 1;
    }
  });
  tx(rows);
  return deleted;
}

function applyArrayFilterInc(doc, path, amount, arrayFilters = []) {
  const match = String(path).match(/^(.+)\.\$\[([^\]]+)\]\.(.+)$/);
  if (!match) return false;
  const [, arrayPath, filterName, childPath] = match;
  const filter = arrayFilters.find((entry) => Object.keys(entry || {}).some((key) => key.startsWith(`${filterName}.`)));
  const array = getPath(doc, arrayPath);
  if (!Array.isArray(array) || !filter) return true;
  for (const item of array) {
    const ok = Object.entries(filter).every(([key, expected]) => {
      const localPath = key.replace(`${filterName}.`, '');
      return matchesCondition(getPath(item, localPath), expected);
    });
    if (!ok) continue;
    const current = Number(getPath(item, childPath) || 0);
    setPath(item, childPath, current + Number(amount || 0));
  }
  return true;
}

function applyUpdate(doc, update = {}, options = {}) {
  const operatorKeys = Object.keys(update).filter((key) => key.startsWith('$'));
  if (operatorKeys.length === 0) {
    Object.assign(doc, clone(update));
    return doc;
  }

  for (const [path, value] of Object.entries(update.$set || {})) setPath(doc, path, clone(value));
  for (const [path, value] of Object.entries(update.$inc || {})) {
    if (applyArrayFilterInc(doc, path, value, options.arrayFilters)) continue;
    const current = Number(getPath(doc, path) || 0);
    setPath(doc, path, current + Number(value || 0));
  }
  for (const [path, value] of Object.entries(update.$push || {})) {
    const current = getPath(doc, path);
    const array = Array.isArray(current) ? current : [];
    const item = clone(value);
    if (item && typeof item === 'object') ensureSubdocumentId(item);
    array.push(item);
    setPath(doc, path, array);
  }
  for (const [path, value] of Object.entries(update.$addToSet || {})) {
    const current = getPath(doc, path);
    const array = Array.isArray(current) ? current : [];
    if (!array.some((entry) => valuesEqual(entry, value))) array.push(clone(value));
    setPath(doc, path, array);
  }
  for (const [path, value] of Object.entries(update.$pull || {})) {
    const current = getPath(doc, path);
    if (!Array.isArray(current)) continue;
    const next = current.filter((entry) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return !Object.entries(value).every(([key, expected]) => valuesEqual(getPath(entry, key), expected));
      }
      return !valuesEqual(entry, value);
    });
    setPath(doc, path, next);
  }
  return doc;
}

class SQLiteQuery {
  constructor(executor, Model) {
    this.executor = executor;
    this.Model = Model;
    this.selectSpec = null;
    this.sortSpec = null;
    this.populateSpecs = [];
    this.leanMode = false;
  }

  select(spec) {
    this.selectSpec = spec;
    return this;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  populate(path, select) {
    this.populateSpecs.push({ path, select });
    return this;
  }

  lean() {
    this.leanMode = true;
    return this;
  }

  async exec() {
    let result = await this.executor();
    if (Array.isArray(result) && this.sortSpec) result = [...result].sort(compareBySort(this.sortSpec));
    result = await this.applyPopulate(result);
    result = this.applySelect(result);
    if (this.leanMode) return clone(result);
    return result;
  }

  async applyPopulate(result) {
    if (!this.populateSpecs.length) return result;
    const populateOne = async (doc) => {
      if (!doc) return doc;
      for (const spec of this.populateSpecs) await populatePath(doc, spec, this.Model);
      return doc;
    };
    if (Array.isArray(result)) {
      for (const doc of result) await populateOne(doc);
      return result;
    }
    return populateOne(result);
  }

  applySelect(result) {
    if (!this.selectSpec) return result;
    if (Array.isArray(result)) return result.map((doc) => applySelect(doc, this.selectSpec));
    return result ? applySelect(result, this.selectSpec) : result;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  finally(callback) {
    return this.exec().finally(callback);
  }
}

async function populatePath(doc, spec, Model) {
  const refName = Model.refs?.[spec.path];
  const RefModel = refName ? modelRegistry.get(refName) : null;
  if (!RefModel) return;

  if (!spec.path.includes('.')) {
    const value = doc[spec.path];
    if (Array.isArray(value)) {
      const populated = [];
      for (const id of value) {
        const found = await RefModel.findById(id).select(spec.select).exec();
        if (found) populated.push(found);
      }
      doc[spec.path] = populated;
    } else if (value) {
      doc[spec.path] = await RefModel.findById(value).select(spec.select).exec();
    }
    return;
  }

  const [arrayPath, childPath] = spec.path.split('.');
  const array = doc[arrayPath];
  if (!Array.isArray(array)) return;
  for (const item of array) {
    const id = item?.[childPath];
    if (!id) continue;
    item[childPath] = await RefModel.findById(id).select(spec.select).exec();
  }
}

function createDocumentModel(name, options = {}) {
  const collection = options.collection || name;

  class SQLiteDocumentModel {
    constructor(input = {}) {
      const data = applyDefaults(input, options.defaults);
      Object.assign(this, hydrateDocumentValue(data));
    }

    get id() {
      return this._id == null ? undefined : String(this._id);
    }

    markModified() {}

    toObject() {
      return stripHelpers(this);
    }

    toJSON() {
      return this.toObject();
    }

    async save() {
      const plain = prepareForSave(this, options);
      writeOne(collection, plain);
      Object.keys(this).forEach((key) => delete this[key]);
      Object.assign(this, hydrateDocumentValue(plain));
      return this;
    }

    static hydrate(data) {
      if (!data) return null;
      const doc = Object.create(SQLiteDocumentModel.prototype);
      Object.assign(doc, hydrateDocumentValue(clone(data)));
      return doc;
    }

    static find(query = {}) {
      return new SQLiteQuery(async () => {
        return readRows(collection)
          .filter((doc) => matchesQuery(doc, query))
          .map((doc) => SQLiteDocumentModel.hydrate(doc));
      }, SQLiteDocumentModel);
    }

    static findOne(query = {}) {
      return new SQLiteQuery(async () => {
        const found = readRows(collection).find((doc) => matchesQuery(doc, query));
        return SQLiteDocumentModel.hydrate(found || null);
      }, SQLiteDocumentModel);
    }

    static findById(id) {
      return new SQLiteQuery(async () => SQLiteDocumentModel.hydrate(readOne(collection, id)), SQLiteDocumentModel);
    }

    static async create(input = {}) {
      const doc = new SQLiteDocumentModel(input);
      await doc.save();
      return doc;
    }

    static findByIdAndUpdate(id, update = {}, updateOptions = {}) {
      return new SQLiteQuery(async () => {
        const idValue = id && typeof id === 'object' ? id._id : id;
        let doc = readOne(collection, idValue);
        if (!doc && updateOptions.upsert) doc = applyDefaults({ _id: idValue }, options.defaults);
        if (!doc) return null;
        applyUpdate(doc, update, updateOptions);
        const next = prepareForSave(doc, options);
        writeOne(collection, next);
        return SQLiteDocumentModel.hydrate(next);
      }, SQLiteDocumentModel);
    }

    static findOneAndUpdate(query = {}, update = {}, updateOptions = {}) {
      return new SQLiteQuery(async () => {
        const docs = readRows(collection);
        let doc = docs.find((entry) => matchesQuery(entry, query));
        if (!doc && updateOptions.upsert) doc = applyDefaults(query, options.defaults);
        if (!doc) return null;
        applyUpdate(doc, update, updateOptions);
        const next = prepareForSave(doc, options);
        writeOne(collection, next);
        return SQLiteDocumentModel.hydrate(updateOptions.new === false ? doc : next);
      }, SQLiteDocumentModel);
    }

    static async updateOne(query = {}, update = {}, updateOptions = {}) {
      const docs = readRows(collection);
      let doc = docs.find((entry) => matchesQuery(entry, query));
      if (!doc && updateOptions.upsert) doc = applyDefaults(query, options.defaults);
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(doc, update, updateOptions);
      writeOne(collection, prepareForSave(doc, options));
      return { matchedCount: 1, modifiedCount: 1 };
    }

    static async updateMany(query = {}, update = {}, updateOptions = {}) {
      const docs = readRows(collection).filter((entry) => matchesQuery(entry, query));
      const tx = getDb().transaction((items) => {
        for (const doc of items) {
          applyUpdate(doc, update, updateOptions);
          writeOne(collection, prepareForSave(doc, options));
        }
      });
      tx(docs);
      return { matchedCount: docs.length, modifiedCount: docs.length };
    }

    static async deleteOne(query = {}) {
      const doc = readRows(collection).find((entry) => matchesQuery(entry, query));
      if (!doc) return { deletedCount: 0 };
      getDb().prepare('DELETE FROM documents WHERE collection = ? AND id = ?')
        .run(collection, String(doc._id));
      return { deletedCount: 1 };
    }

    static async deleteMany(query = {}) {
      return { deletedCount: deleteMatching(collection, query) };
    }
  }

  SQLiteDocumentModel.modelName = name;
  SQLiteDocumentModel.collectionName = collection;
  SQLiteDocumentModel.refs = options.refs || {};
  modelRegistry.set(name, SQLiteDocumentModel);
  return SQLiteDocumentModel;
}

module.exports = {
  createDocumentModel,
  clone,
};

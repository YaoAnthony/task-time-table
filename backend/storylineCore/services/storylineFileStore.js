const fs = require('fs');
const path = require('path');

const STORYLINE_DATA_DIR = process.env.STORYLINE_DATA_DIR
  ? path.resolve(process.env.STORYLINE_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data', 'storylines');
const ENABLED_DIR = path.join(STORYLINE_DATA_DIR, 'enabled');
const DRAFTS_DIR = path.join(STORYLINE_DATA_DIR, 'drafts');

function ensureStorylineDataDirs() {
  fs.mkdirSync(ENABLED_DIR, { recursive: true });
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
}

function listStorylineDefinitions() {
  ensureStorylineDataDirs();
  return readJsonFilesFromDir(ENABLED_DIR).filter(Boolean);
}

function readStorylineDefinition(storylineId) {
  ensureStorylineDataDirs();
  const filePath = path.join(ENABLED_DIR, `${toSafeFileStem(storylineId)}.json`);
  return readJsonFile(filePath);
}

function writeStorylineDefinition(definition) {
  ensureStorylineDataDirs();
  const filePath = path.join(ENABLED_DIR, `${toSafeFileStem(definition.id)}.json`);
  writeJsonFileAtomic(filePath, definition);
}

function archiveStorylineDefinition(storylineId) {
  const existing = readStorylineDefinition(storylineId);
  const now = new Date().toISOString();
  const archived = {
    ...(existing || {
      schemaVersion: 1,
      id: String(storylineId),
      title: String(storylineId),
      version: 1,
      states: ['archived'],
      triggers: [],
      events: {},
    }),
    status: 'archived',
    updatedAt: now,
    archivedAt: now,
  };
  writeStorylineDefinition(archived);
  return archived;
}

function listDraftFiles(userId) {
  if (isFileStoreDisabled()) return [];
  ensureStorylineDataDirs();
  return readJsonFilesFromDir(DRAFTS_DIR).filter((draft) => draft && draft.userId === String(userId));
}

function readDraftFile(draftId) {
  if (isFileStoreDisabled()) return null;
  ensureStorylineDataDirs();
  const filePath = path.join(DRAFTS_DIR, `${toSafeFileStem(draftId)}.json`);
  return readJsonFile(filePath);
}

function writeDraftFile(draft) {
  if (isFileStoreDisabled()) return;
  ensureStorylineDataDirs();
  const filePath = path.join(DRAFTS_DIR, `${toSafeFileStem(draft.id)}.json`);
  writeJsonFileAtomic(filePath, draft);
}

function deleteDraftFile(draftId) {
  if (isFileStoreDisabled()) return;
  ensureStorylineDataDirs();
  const filePath = path.join(DRAFTS_DIR, `${toSafeFileStem(draftId)}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function readJsonFilesFromDir(dir) {
  return fs.readdirSync(dir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => readJsonFile(path.join(dir, fileName)))
    .filter(Boolean);
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`[StorylineFileStore] Failed to read ${filePath}:`, err.message);
    return null;
  }
}

function writeJsonFileAtomic(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function toSafeFileStem(value) {
  return String(value || 'storyline').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isFileStoreDisabled() {
  return process.env.STORYLINE_DISABLE_DRAFT_FILE_STORE === 'true';
}

module.exports = {
  STORYLINE_DATA_DIR,
  ENABLED_DIR,
  DRAFTS_DIR,
  ensureStorylineDataDirs,
  archiveStorylineDefinition,
  listStorylineDefinitions,
  readStorylineDefinition,
  writeStorylineDefinition,
  listDraftFiles,
  readDraftFile,
  writeDraftFile,
  deleteDraftFile,
};

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db = null;

function getDatabasePath() {
  return process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'timeplan.sqlite');
}

function connectLocalDatabase() {
  if (db) return db;

  const dbPath = getDatabasePath();
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  configureJournalMode(db, dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_documents_collection_updated
      ON documents(collection, updated_at);
  `);
  return db;
}

function configureJournalMode(database, dbPath) {
  const modes = ['WAL', 'PERSIST', 'TRUNCATE'];
  for (const mode of modes) {
    try {
      database.pragma(`journal_mode = ${mode}`);
      return;
    } catch (error) {
      if (mode === modes[modes.length - 1]) {
        console.warn(`SQLite journal mode fallback failed for ${dbPath}; using SQLite default.`, error.message);
      }
    }
  }
}

function closeLocalDatabase() {
  if (!db) return;
  db.close();
  db = null;
}

function getDb() {
  return connectLocalDatabase();
}

module.exports = {
  connectLocalDatabase,
  closeLocalDatabase,
  getDatabasePath,
  getDb,
};

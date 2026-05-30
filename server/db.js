const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.MAVERICK_DB_PATH
    || path.resolve(__dirname, '..', 'maverick_telemetry.db');

try {
    const db = new Database(dbPath, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    console.log(`[db] Connected to ${dbPath}`);
    module.exports = db;
} catch (error) {
    console.error(`[db] Failed to open database at ${dbPath}:`, error.message);
    console.error('[db] Run db/migrate.py first to create the database.');
    process.exit(1);
}
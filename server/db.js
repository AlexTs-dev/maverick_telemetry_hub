const Database = require('better-sqlite3');
const path = require('path');

// 1. Path to your existing database file
// Adjust 'app.db' to match your actual filename and location
const dbPath = path.resolve(__dirname, '/home/pi/maverick_telemetry.db');

try {
    // 2. Initialize with fileMustExist set to true
    // This prevents the app from starting if the DB path is wrong
    const db = new Database(dbPath, { 
        readonly: true,
        fileMustExist: true, 
        verbose: console.log // Keeps SQL logging active for dev
    });

    // 3. Keep WAL mode enabled for optimal performance
    db.pragma('journal_mode = WAL');

    // 4. Export the connected instance
    module.exports = db;

} catch (error) {
    console.error("❌ Failed to connect to the existing database:", error.message);
    process.exit(1); // Stop the server if the DB can't be loaded
}
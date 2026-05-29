"""
db/migrate.py
Maverick Telemetry Hub

Creates the SQLite database and all tables if they don't exist.
Safe to run multiple times — uses CREATE IF NOT EXISTS throughout.

Run once before starting any services:
    python db/migrate.py

Run again after schema changes — existing data is preserved.
"""

import os
import sqlite3
import logging
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_default_db = Path(__file__).resolve().parent.parent / "maverick_telemetry.db"
DB_PATH = Path(os.environ.get("MAVERICK_DB_PATH", _default_db))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("migrate")

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA = """
-- one row per ignition cycle
CREATE TABLE IF NOT EXISTS trips (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at       TEXT NOT NULL,
    ended_at         TEXT,            -- null until ignition off
    duration_seconds INTEGER,
    odometer_start   REAL,
    odometer_end     REAL,
    dtc_count        INTEGER DEFAULT 0,
    notes            TEXT
);

-- raw per-second sensor stream
CREATE TABLE IF NOT EXISTS readings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id         INTEGER NOT NULL REFERENCES trips(id),
    ts              TEXT NOT NULL,
    rpm             REAL,
    speed_mph       REAL,
    coolant_temp_f  REAL,
    throttle_pct    REAL,
    battery_soc_pct REAL,    -- hybrid PID, nullable
    ev_mode         INTEGER, -- 1/0, hybrid PID, nullable
    regen_kw        REAL,    -- hybrid PID, nullable
    fuel_rate_gph   REAL
);

-- fault codes are events, not samples
CREATE TABLE IF NOT EXISTS dtcs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id          INTEGER NOT NULL REFERENCES trips(id),
    code             TEXT NOT NULL,
    first_seen_at    TEXT NOT NULL,
    claude_diagnosis TEXT,    -- null until requested via dashboard
    diagnosed_at     TEXT
);

-- computed once on trip close, queried often
CREATE TABLE IF NOT EXISTS trip_summaries (
    trip_id              INTEGER PRIMARY KEY REFERENCES trips(id),
    avg_speed_mph        REAL,
    max_speed_mph        REAL,
    avg_rpm              REAL,
    max_coolant_temp_f   REAL,
    ev_time_pct          REAL,
    total_regen_kwh      REAL,
    avg_fuel_economy_mpg REAL,
    min_battery_soc_pct  REAL
);

-- indexes for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_readings_trip
    ON readings(trip_id, ts);

CREATE INDEX IF NOT EXISTS idx_trips_started
    ON trips(started_at);

CREATE INDEX IF NOT EXISTS idx_dtcs_code
    ON dtcs(code);

CREATE INDEX IF NOT EXISTS idx_dtcs_trip
    ON dtcs(trip_id);
"""

# ---------------------------------------------------------------------------
# Migration tracking
# ---------------------------------------------------------------------------
# Simple version table so future schema changes can be applied
# incrementally without dropping and recreating the database.

VERSION_TABLE = """
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL
);
"""

CURRENT_VERSION = 1

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

def get_schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT MAX(version) as v FROM schema_version"
    ).fetchone()
    return row[0] if row and row[0] is not None else 0


def run() -> None:
    log.info(f"Database path: {DB_PATH}")

    # Create parent directory if it doesn't exist
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)

    try:
        # Enable WAL mode and foreign keys
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")

        # Create version tracking table first
        conn.executescript(VERSION_TABLE)

        current = get_schema_version(conn)
        log.info(f"Current schema version: {current}")

        if current >= CURRENT_VERSION:
            log.info("Schema is up to date — nothing to do")
            return

        # Apply schema
        log.info(f"Applying schema version {CURRENT_VERSION}...")
        conn.executescript(SCHEMA)

        # Record the version
        conn.execute(
            "INSERT INTO schema_version (version, applied_at) VALUES (?, datetime('now'))",
            (CURRENT_VERSION,),
        )
        conn.commit()

        log.info(f"Schema version {CURRENT_VERSION} applied successfully")

        # Confirm tables exist
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        log.info(f"Tables: {[t[0] for t in tables]}")

    except sqlite3.Error as e:
        log.critical(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    log.info("migrate.py starting")
    run()



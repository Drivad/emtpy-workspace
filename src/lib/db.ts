import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "health.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

declare global {
  var __healthDb: Database.Database | undefined;
}

function createConnection(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      meta TEXT,
      UNIQUE(source, metric, start_time, end_time)
    );
    CREATE INDEX IF NOT EXISTS idx_raw_samples_metric_time ON raw_samples(metric, start_time);

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      workout_type TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_min REAL,
      calories REAL,
      distance_km REAL,
      avg_hr REAL,
      meta TEXT,
      UNIQUE(source, workout_type, start_time)
    );
    CREATE INDEX IF NOT EXISTS idx_workouts_time ON workouts(start_time);

    CREATE TABLE IF NOT EXISTS fasting_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_hours REAL,
      meta TEXT,
      UNIQUE(source, start_time)
    );
    CREATE INDEX IF NOT EXISTS idx_fasting_time ON fasting_sessions(start_time);

    CREATE TABLE IF NOT EXISTS sleep_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_min REAL,
      sleep_score REAL,
      meta TEXT,
      UNIQUE(source, start_time)
    );
    CREATE INDEX IF NOT EXISTS idx_sleep_time ON sleep_sessions(start_time);

    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      content_markdown TEXT NOT NULL,
      model TEXT,
      created_at TEXT NOT NULL,
      input_summary_json TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      source TEXT PRIMARY KEY,
      last_synced_at TEXT,
      status TEXT,
      message TEXT
    );
  `);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__healthDb) {
    globalThis.__healthDb = createConnection();
  }
  return globalThis.__healthDb;
}

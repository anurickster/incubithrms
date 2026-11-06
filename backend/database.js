import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT = resolve(__dirname, "..");
export const DEFAULT_DB_PATH = resolve(ROOT, "data", "salaries.sqlite3");

// One reusable synchronous connection per database path; this is not a worker pool.
const connectionPool = new Map();

export function getDatabasePath(customPath) {
  return customPath || process.env.SALARY_DB_PATH || DEFAULT_DB_PATH;
}

export function openDatabase(customPath) {
  const dbPath = getDatabasePath(customPath);

  // If already pooled and open, reuse connection
  if (connectionPool.has(dbPath)) {
    return connectionPool.get(dbPath);
  }

  if (dbPath !== ":memory:") {
    const parentDir = dirname(dbPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);
  const originalClose = db.close.bind(db);
  db.close = () => {
    connectionPool.delete(dbPath);
    return originalClose();
  };

  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 10000;");

  // WAL supports other database connections reading while this connection writes.
  if (dbPath !== ":memory:") {
    try {
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA synchronous = NORMAL;");
    } catch {
      // Graceful fallback if filesystem does not support WAL
    }
  }

  connectionPool.set(dbPath, db);
  return db;
}

export function closeDatabase(customPath) {
  const dbPath = getDatabasePath(customPath);
  if (connectionPool.has(dbPath)) {
    const db = connectionPool.get(dbPath);
    try {
      db.close();
    } catch {}
    connectionPool.delete(dbPath);
  }
}

export function closeAllDatabases() {
  for (const [key, db] of connectionPool.entries()) {
    try {
      db.close();
    } catch {}
    connectionPool.delete(key);
  }
}

export function initializeDatabase(customPath) {
  const db = openDatabase(customPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      employee_id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      country TEXT NOT NULL,
      department TEXT NOT NULL,
      job_title TEXT NOT NULL,
      hire_date TEXT NOT NULL,
      base_salary_cents INTEGER NOT NULL CHECK (base_salary_cents > 0),
      currency TEXT NOT NULL CHECK (length(currency) = 3),
      salary_effective_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_employees_name
      ON employees(last_name, first_name);

    CREATE INDEX IF NOT EXISTS idx_employees_country_department
      ON employees(country, department);

    CREATE INDEX IF NOT EXISTS idx_employees_currency
      ON employees(currency);

    CREATE TABLE IF NOT EXISTS salary_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL REFERENCES employees(employee_id),
      previous_salary_cents INTEGER,
      new_salary_cents INTEGER NOT NULL CHECK (new_salary_cents > 0),
      previous_currency TEXT,
      new_currency TEXT NOT NULL CHECK (length(new_currency) = 3),
      effective_date TEXT NOT NULL,
      actor TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, effective_date)
    );

    CREATE INDEX IF NOT EXISTS idx_salary_history_employee_date
      ON salary_history(employee_id, effective_date DESC);

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL REFERENCES employees(employee_id),
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_events_employee
      ON audit_events(employee_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created
      ON idempotency_keys(created_at);
  `);
  // Keep existing demo databases usable. Old keys have no request fingerprint
  // and are rejected on replay rather than being trusted for a different request.
  const columns = db.prepare("PRAGMA table_info(idempotency_keys)").all();
  if (!columns.some((column) => column.name === "request_json")) {
    db.exec("ALTER TABLE idempotency_keys ADD COLUMN request_json TEXT;");
  }
  return db;
}

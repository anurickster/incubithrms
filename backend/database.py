import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = ROOT / "data" / "salaries.sqlite3"


def database_path() -> Path:
    return Path(os.environ.get("SALARY_DB_PATH", DEFAULT_DB_PATH))


@contextmanager
def connect(path: str | Path | None = None) -> Iterator[sqlite3.Connection]:
    db_path = Path(path) if path else database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize(path: str | Path | None = None) -> None:
    with connect(path) as connection:
        connection.executescript(
            """
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
            """
        )

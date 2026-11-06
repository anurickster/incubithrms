import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach, beforeEach, describe } from "node:test";
import { closeAllDatabases, initializeDatabase, openDatabase } from "../database.js";
import { ConflictError, getEmployee, getStats, listEmployees, updateSalary } from "../service.js";

describe("Compensation correctness regressions", () => {
  let directory;
  let dbPath;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "compwise-regressions-"));
    dbPath = join(directory, "salary.sqlite3");
    const db = initializeDatabase(dbPath);
    const insert = db.prepare(`INSERT INTO employees (
      employee_id, first_name, last_name, email, country, department, job_title,
      hire_date, base_salary_cents, currency, salary_effective_date
    ) VALUES (?, 'Test', 'Employee', ?, ?, ?, 'Engineer', '2020-01-01', ?, ?, '2020-01-01')`);
    const rows = [
      ["Germany", "Engineering", 100, "EUR"],
      ["Germany", "Engineering", 200, "EUR"],
      ["Germany", "Engineering", 300, "EUR"],
      ["Germany", "Engineering", 400, "EUR"],
      ["France", "Engineering", 900, "EUR"],
      ["Germany", "Sales", 700, "EUR"],
      ["India", "Engineering", 1000, "INR"],
    ];
    rows.forEach(([country, department, salary, currency], i) => {
      insert.run(`TEST-${i}`, `test${i}@acme.example`, country, department, salary * 100, currency);
    });
  });
  afterEach(() => {
    closeAllDatabases();
    rmSync(directory, { recursive: true, force: true });
  });

  test("combined country and department filters match the directory and exact percentiles", () => {
    const filters = { dbPath, country: "Germany", department: "Engineering" };
    const stats = getStats(filters);
    assert.equal(stats.employee_count, listEmployees(filters).total);
    assert.equal(stats.employee_count, 4);
    assert.deepEqual(stats.countries, [{ country: "Germany", headcount: 4 }]);
    assert.deepEqual(stats.departments, [{ department: "Engineering", headcount: 4 }]);
    assert.deepEqual(stats.currencies, [{
      currency: "EUR", headcount: 4, average_salary: 250, median_salary: 250,
      p25_salary: 175, p75_salary: 325, min_salary: 100, max_salary: 400, spread_ratio: 4,
    }]);
    assert.equal(stats.compensation_by_country[0].median_salary, 250);
    assert.equal(stats.compensation_by_department[0].median_salary, 250);
    assert.equal(stats.pay_bands_by_title[0].headcount, 4);
  });

  test("individual filters and empty cohorts stay scoped", () => {
    assert.equal(getStats({ dbPath, country: "Germany" }).employee_count, 5);
    assert.equal(getStats({ dbPath, department: "Engineering" }).employee_count, 6);
    const empty = getStats({ dbPath, country: "France", department: "Sales" });
    assert.equal(empty.employee_count, 0);
    assert.deepEqual(empty.currencies, []);
    assert.deepEqual(empty.pay_bands_by_title, []);
  });

  test("singleton currency cohort has exact percentiles without combining currencies", () => {
    const stats = getStats({ dbPath });
    const inr = stats.currencies.find((group) => group.currency === "INR");
    assert.equal(inr.headcount, 1);
    for (const key of ["average_salary", "median_salary", "p25_salary", "p75_salary", "min_salary", "max_salary"]) {
      assert.equal(inr[key], 1000);
    }
    assert.equal(stats.currencies.find((group) => group.currency === "EUR").headcount, 6);
  });

  const payload = { base_salary: "150.00", currency: "eur", effective_date: "2021-01-01" };

  test("normalized retry replays once and rejects another employee or payload", () => {
    const options = { dbPath, idempotencyKey: "same-request" };
    const first = updateSalary("TEST-0", payload, options);
    const retry = updateSalary("TEST-0", { ...payload, base_salary: 150, currency: "EUR" }, options);
    assert.deepEqual(retry, first);
    assert.throws(() => updateSalary("TEST-1", payload, options), ConflictError);
    assert.throws(() => updateSalary("TEST-0", { ...payload, base_salary: 160 }, options), ConflictError);
    assert.equal(getEmployee("TEST-1", dbPath).base_salary, 200);
    assert.equal(getEmployee("TEST-0", dbPath).salary_history.length, 1);
  });

  test("idempotency insert failure rolls back salary, history, and audit together", () => {
    const db = openDatabase(dbPath);
    const before = getEmployee("TEST-0", dbPath);
    db.exec(`CREATE TRIGGER reject_key BEFORE INSERT ON idempotency_keys
      BEGIN SELECT RAISE(ABORT, 'injected cache failure'); END;`);
    const options = { dbPath, idempotencyKey: "atomic-request" };
    assert.throws(() => updateSalary("TEST-0", payload, options), /injected cache failure/);
    assert.deepEqual(getEmployee("TEST-0", dbPath), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM audit_events").get().total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM idempotency_keys").get().total, 0);
    db.exec("DROP TRIGGER reject_key");
    assert.equal(updateSalary("TEST-0", payload, options).base_salary, 150);
  });

  test("existing schema migrates and legacy unbound keys cannot replay", () => {
    const db = openDatabase(dbPath);
    db.exec(`DROP TABLE idempotency_keys;
      CREATE TABLE idempotency_keys (
        key TEXT PRIMARY KEY, employee_id TEXT NOT NULL, response_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO idempotency_keys (key, employee_id, response_json) VALUES ('legacy', 'TEST-0', '{}');`);
    initializeDatabase(dbPath);
    assert.throws(() => updateSalary("TEST-0", payload, { dbPath, idempotencyKey: "legacy" }), ConflictError);
    assert.equal(getEmployee("TEST-0", dbPath).base_salary, 100);
  });
});

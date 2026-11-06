import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe, beforeEach, afterEach } from "node:test";
import { closeAllDatabases, initializeDatabase, openDatabase } from "../database.js";
import { buildEmployees, seedDatabase } from "../seed.js";
import {
  checkDatabaseHealth,
  exportEmployeesCsv,
  getEmployee,
  getStats,
  listEmployees,
  updateSalary,
  ValidationError,
} from "../service.js";

describe("Salary Service Tests", () => {
  let tempDir;
  let dbPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "compwise-test-"));
    dbPath = join(tempDir, "test.sqlite3");
    initializeDatabase(dbPath);

    const employees = buildEmployees().slice(0, 40);
    const db = openDatabase(dbPath);
    try {
      db.exec("BEGIN IMMEDIATE;");
      const insertEmp = db.prepare(`
        INSERT INTO employees (
          employee_id, first_name, last_name, email, country, department,
          job_title, hire_date, base_salary_cents, currency, salary_effective_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertHist = db.prepare(`
        INSERT INTO salary_history (
          employee_id, new_salary_cents, new_currency, effective_date, actor
        ) VALUES (?, ?, ?, ?, 'System seed')
      `);

      for (const e of employees) {
        insertEmp.run(
          e.employee_id,
          e.first_name,
          e.last_name,
          e.email,
          e.country,
          e.department,
          e.job_title,
          e.hire_date,
          e.base_salary_cents,
          e.currency,
          e.salary_effective_date
        );
        insertHist.run(
          e.employee_id,
          e.base_salary_cents,
          e.currency,
          e.salary_effective_date
        );
      }
      db.exec("COMMIT;");
    } finally {
      db.close();
    }
  });

  afterEach(() => {
    closeAllDatabases();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("seed data is deterministic and has unique employee IDs", () => {
    const rows1 = buildEmployees();
    const rows2 = buildEmployees();
    assert.equal(rows1.length, 10_000);
    assert.equal(rows2.length, 10_000);
    assert.deepEqual(rows1[0], rows2[0]);
    assert.deepEqual(rows1[9999], rows2[9999]);

    const ids = new Set(rows1.map((r) => r.employee_id));
    assert.equal(ids.size, 10_000);
  });

  test("seed is idempotent and creates baseline salary history", () => {
    // Current db has 40 records; seed will insert remaining 9,960
    const insertedFirst = seedDatabase(dbPath);
    assert.equal(insertedFirst, 9_960);

    const insertedSecond = seedDatabase(dbPath);
    assert.equal(insertedSecond, 0);

    const db = openDatabase(dbPath);
    try {
      const empCount = db.prepare("SELECT COUNT(*) AS c FROM employees").get().c;
      const histCount = db.prepare("SELECT COUNT(*) AS c FROM salary_history").get().c;
      assert.equal(empCount, 10_000);
      assert.equal(histCount, 10_000);
    } finally {
      db.close();
    }
  });

  test("search, filter, and pagination work together", () => {
    const result = listEmployees({
      dbPath,
      query: "ACME-00",
      country: "United States",
      page: 1,
      pageSize: 3,
    });

    assert.equal(result.employees.length, 3);
    assert.equal(result.total, 4);
    assert.equal(result.pages, 2);
    assert.ok(result.employees.every((e) => e.country === "United States"));
    assert.ok(result.employees[0].base_salary > 0);
  });

  test("reseed after reopening preserves salary edits, history, and audit", () => {
    const updated = updateSalary("ACME-00001", {
      base_salary: "135000.50", currency: "USD", effective_date: "2025-01-01",
    }, dbPath);
    closeAllDatabases();
    seedDatabase(dbPath);
    assert.deepEqual(getEmployee("ACME-00001", dbPath), updated);
    const db = openDatabase(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM employees").get().total, 10000);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE employee_id = ?").get("ACME-00001").total, 1);
  });

  test("sort field is validated and numeric salary order is correct", () => {
    const result = listEmployees({
      dbPath,
      sort: "base_salary",
      direction: "desc",
      pageSize: 5,
    });

    const salaries = result.employees.map((e) => e.base_salary);
    const sortedCopy = [...salaries].sort((a, b) => b - a);
    assert.deepEqual(salaries, sortedCopy);

    assert.throws(
      () => listEmployees({ dbPath, sort: "email; DROP TABLE employees" }),
      /Unsupported sort field/
    );
  });

  test("pagination limits are strictly validated", () => {
    assert.throws(
      () => listEmployees({ dbPath, page: 0 }),
      /Page must be at least 1/
    );
    assert.throws(
      () => listEmployees({ dbPath, pageSize: 101 }),
      /Page size must be between 1 and 100/
    );
    assert.throws(
      () => listEmployees({ dbPath, direction: "invalid" }),
      /Sort direction must be asc or desc/
    );
  });

  test("salary change is effective-dated and audited", () => {
    const employeeId = "ACME-00001";
    const employee = getEmployee(employeeId, dbPath);
    assert.ok(employee);

    const [y, m, d] = employee.salary_effective_date.split("-").map(Number);
    const nextDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);

    const updated = updateSalary(
      employeeId,
      { base_salary: 123456.78, currency: "usd", effective_date: nextDate },
      dbPath
    );

    assert.equal(updated.base_salary, 123456.78);
    assert.equal(updated.currency, "USD");
    assert.equal(updated.salary_history.length, 2);
    assert.equal(updated.salary_history[0].actor, "Local HR Manager");
    assert.equal(updated.salary_history[0].new_salary, 123456.78);

    const db = openDatabase(dbPath);
    try {
      const audit = db.prepare("SELECT event_type, details FROM audit_events WHERE employee_id = ?").get(employeeId);
      assert.ok(audit);
      assert.equal(audit.event_type, "salary.updated");
      assert.match(audit.details, /Salary updated from/);
    } finally {
      db.close();
    }
  });

  test("salary validation rejects bad values and backdating", () => {
    const employee = getEmployee("ACME-00001", dbPath);
    const [y, m, d] = employee.salary_effective_date.split("-").map(Number);
    const later = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const invalidPayloads = [
      { base_salary: -1, currency: "USD", effective_date: later },
      { base_salary: true, currency: "USD", effective_date: later },
      { base_salary: "NaN", currency: "USD", effective_date: later },
      { base_salary: 100.123, currency: "USD", effective_date: later },
      { base_salary: 100, currency: "US", effective_date: later },
      { base_salary: 100, currency: "ZZZ", effective_date: later },
      { base_salary: 100, currency: "USD", effective_date: "2026-02-30" },
      { base_salary: 100, currency: "USD", effective_date: tomorrow },
    ];

    for (const payload of invalidPayloads) {
      assert.throws(
        () => updateSalary("ACME-00001", payload, dbPath),
        ValidationError
      );
    }

    // Rejection of backdating / equal date
    assert.throws(
      () =>
        updateSalary(
          "ACME-00001",
          {
            base_salary: 123456,
            currency: "USD",
            effective_date: employee.salary_effective_date,
          },
          dbPath
        ),
      /Effective date must be later than the current salary date/
    );
  });

  test("same-day duplicate change fails without partial update", () => {
    const employeeId = "ACME-00001";
    const employee = getEmployee(employeeId, dbPath);
    const [y, m, d] = employee.salary_effective_date.split("-").map(Number);
    const later = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);

    updateSalary(
      employeeId,
      { base_salary: 120000, currency: "USD", effective_date: later },
      dbPath
    );

    assert.throws(
      () =>
        updateSalary(
          employeeId,
          { base_salary: 125000, currency: "USD", effective_date: later },
          dbPath
        ),
      /Effective date must be later than the current salary date|already recorded/
    );

    assert.equal(getEmployee(employeeId, dbPath).base_salary, 120000);
  });

  test("currency stats compute correct medians and percentiles without mixing units", () => {
    const result = getStats({ dbPath });
    assert.equal(result.employee_count, 40);

    const totalHeadcount = result.currencies.reduce((acc, c) => acc + c.headcount, 0);
    assert.equal(totalHeadcount, 40);

    for (const group of result.currencies) {
      assert.ok(group.headcount > 0);
      assert.ok(group.average_salary > 0);
      assert.ok(group.median_salary > 0);
      assert.ok(group.p25_salary <= group.median_salary);
      assert.ok(group.median_salary <= group.p75_salary);
      assert.ok(group.min_salary <= group.max_salary);
      assert.ok(group.spread_ratio >= 1);
    }

    assert.ok(result.pay_bands_by_title.length > 0);
  });

  test("exportEmployeesCsv produces valid RFC-4180 CSV", () => {
    const csv = exportEmployeesCsv({ dbPath, country: "United States" });
    const lines = csv.split("\r\n");
    assert.ok(lines.length > 1);
    assert.equal(
      lines[0],
      "Employee ID,First Name,Last Name,Email,Country,Department,Job Title,Hire Date,Base Salary,Currency,Salary Effective Date"
    );
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      assert.equal(cols[4], "United States");
      assert.equal(cols[9], "USD");
    }
  });

  test("checkDatabaseHealth returns connected status and employee count", () => {
    const health = checkDatabaseHealth(dbPath);
    assert.equal(health.status, "connected");
    assert.equal(health.employee_count, 40);
  });

  test("idempotent updateSalary replay returns identical response without throwing duplicate error", () => {
    const employeeId = "ACME-00001";
    const employee = getEmployee(employeeId, dbPath);
    const [y, m, d] = employee.salary_effective_date.split("-").map(Number);
    const later = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const idempotencyKey = "test-idem-key-99999";

    const payload = { base_salary: 135000, currency: "USD", effective_date: later };
    const firstCall = updateSalary(employeeId, payload, { dbPath, idempotencyKey });
    assert.equal(firstCall.base_salary, 135000);

    // Second call with same idempotency key should safely replay first response
    const secondCall = updateSalary(employeeId, payload, { dbPath, idempotencyKey });
    assert.deepEqual(secondCall, firstCall);

    // Ensure database still only has 2 salary history rows (original seed + 1 update)
    const db = openDatabase(dbPath);
    const histCount = db.prepare("SELECT COUNT(*) AS c FROM salary_history WHERE employee_id = ?").get(employeeId).c;
    assert.equal(histCount, 2);
  });
});


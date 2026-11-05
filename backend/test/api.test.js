import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import test, { describe, beforeEach, afterEach } from "node:test";
import { initializeDatabase, openDatabase } from "../database.js";
import { createSalaryHandler } from "../server.js";

function dispatchRequest(handler, { method = "GET", url = "/", headers = {}, body = null }) {
  const req = new Readable({
    read() {
      if (body !== null) {
        this.push(typeof body === "string" ? body : JSON.stringify(body));
      }
      this.push(null);
    },
  });

  req.method = method;
  req.url = url;
  req.headers = {
    "content-type": "application/json",
    ...headers,
  };

  let statusCode = 200;
  const resHeaders = {};
  const chunks = [];

  const res = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });

  res.writeHead = (code, h = {}) => {
    statusCode = code;
    for (const [k, v] of Object.entries(h)) {
      resHeaders[k.toLowerCase()] = v;
    }
  };
  res.setHeader = (k, v) => {
    resHeaders[k.toLowerCase()] = v;
  };
  res.getHeader = (k) => resHeaders[k.toLowerCase()];

  return new Promise((resolve, reject) => {
    res.on("finish", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      let data = raw;
      const contentType = resHeaders["content-type"] || "";
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = raw;
        }
      }
      resolve({
        status: statusCode,
        headers: resHeaders,
        data,
      });
    });

    res.on("error", reject);
    req.on("error", reject);

    handler(req, res).catch(reject);
  });
}

describe("Salary API HTTP Tests", () => {
  let tempDir;
  let dbPath;
  let handler;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "compwise-api-test-"));
    dbPath = join(tempDir, "api.sqlite3");
    initializeDatabase(dbPath);

    const db = openDatabase(dbPath);
    try {
      db.prepare(`
        INSERT INTO employees (
          employee_id, first_name, last_name, email, country, department,
          job_title, hire_date, base_salary_cents, currency, salary_effective_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "ACME-TEST01",
        "Aisha",
        "Khan",
        "aisha@acme.example",
        "India",
        "Engineering",
        "Software Engineer",
        "2020-01-02",
        5000000,
        "INR",
        "2020-01-02"
      );

      db.prepare(`
        INSERT INTO salary_history (
          employee_id, new_salary_cents, new_currency, effective_date, actor
        ) VALUES ('ACME-TEST01', 5000000, 'INR', '2020-01-02', 'System seed')
      `).run();
    } finally {
      db.close();
    }

    handler = createSalaryHandler({ dbPath });
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("GET /api/health returns 200 ok", async () => {
    const res = await dispatchRequest(handler, { method: "GET", url: "/api/health" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { status: "ok" });
  });

  test("GET /api/stats returns statistics", async () => {
    const res = await dispatchRequest(handler, { method: "GET", url: "/api/stats" });
    assert.equal(res.status, 200);
    assert.equal(res.data.employee_count, 1);
    assert.equal(res.data.compensation_by_department[0].currency, "INR");
    assert.equal(res.data.compensation_by_department[0].average_salary, 50000);
  });

  test("GET /api/employees supports search, filtering, and pagination", async () => {
    const res = await dispatchRequest(handler, {
      method: "GET",
      url: "/api/employees?q=Aisha&page=1&page_size=5",
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.total, 1);
    assert.equal(res.data.employees[0].base_salary, 50000);
    assert.equal(res.data.employees[0].currency, "INR");
  });

  test("GET /api/employees/:id returns profile and history", async () => {
    const res = await dispatchRequest(handler, {
      method: "GET",
      url: "/api/employees/ACME-TEST01",
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.employee_id, "ACME-TEST01");
    assert.equal(res.data.salary_history.length, 1);
  });

  test("GET /api/employees/:id with non-existent id returns 404", async () => {
    const res = await dispatchRequest(handler, {
      method: "GET",
      url: "/api/employees/NON-EXISTENT",
    });
    assert.equal(res.status, 404);
    assert.equal(res.data.error, "Employee not found.");
  });

  test("PATCH /api/employees/:id updates salary and updates history", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await dispatchRequest(handler, {
      method: "PATCH",
      url: "/api/employees/ACME-TEST01",
      body: {
        base_salary: "65000.25",
        currency: "inr",
        effective_date: today,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.base_salary, 65000.25);
    assert.equal(res.data.currency, "INR");
    assert.equal(res.data.salary_history.length, 2);
    assert.equal(res.data.salary_history[0].effective_date, today);
    assert.equal(res.data.salary_history[0].previous_salary, 50000);
    assert.equal(res.data.salary_history[0].new_salary, 65000.25);
  });

  test("PATCH /api/employees/:id rejects future salary date", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await dispatchRequest(handler, {
      method: "PATCH",
      url: "/api/employees/ACME-TEST01",
      body: {
        base_salary: 60000,
        currency: "INR",
        effective_date: tomorrow,
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Future salary changes are not supported/);
  });

  test("PATCH /api/employees/:id rejects invalid salary amounts", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await dispatchRequest(handler, {
      method: "PATCH",
      url: "/api/employees/ACME-TEST01",
      body: {
        base_salary: -500,
        currency: "INR",
        effective_date: today,
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Salary must be a positive number/);
  });

  test("GET /api/employees/export streams RFC-4180 CSV attachment", async () => {
    const res = await dispatchRequest(handler, {
      method: "GET",
      url: "/api/employees/export?country=India",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/csv/);
    assert.match(res.headers["content-disposition"], /attachment; filename="acme-employees.csv"/);
    assert.match(res.data, /ACME-TEST01,Aisha,Khan/);
  });

  test("Unsupported HTTP methods return 405 Method Not Allowed", async () => {
    const res = await dispatchRequest(handler, {
      method: "DELETE",
      url: "/api/employees/ACME-TEST01",
    });
    assert.equal(res.status, 405);
    assert.equal(res.data.error, "Method not allowed.");
  });
});

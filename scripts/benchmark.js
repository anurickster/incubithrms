import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, cpus } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { closeAllDatabases, openDatabase } from "../backend/database.js";
import { seedDatabase } from "../backend/seed.js";
import { getStats, listEmployees, exportEmployeesCsv } from "../backend/service.js";

const directory = mkdtempSync(join(tmpdir(), "compwise-benchmark-"));
const dbPath = join(directory, "benchmark.sqlite3");
const rounded = (value) => Number(value.toFixed(3));
function measure(operation) {
  for (let i = 0; i < 5; i++) operation();
  const times = [];
  let result;
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    result = operation();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const body = typeof result === "string" ? result : JSON.stringify(result);
  return {
    samples: times.length,
    median_ms: rounded((times[9] + times[10]) / 2),
    p95_ms: rounded(times[18]),
    response_bytes: Buffer.byteLength(body),
    estimated_gzip_bytes: gzipSync(body).length,
  };
}
try {
  let start = performance.now();
  const inserted = seedDatabase(dbPath);
  const seedMs = performance.now() - start;
  start = performance.now();
  const reinserted = seedDatabase(dbPath);
  const seedAgainMs = performance.now() - start;
  const measurements = {
    directory: measure(() => listEmployees({ dbPath, pageSize: 10 })),
    substring_search: measure(() => listEmployees({ dbPath, query: "Aarav", pageSize: 10 })),
    cohort: measure(() => listEmployees({ dbPath, country: "Germany", department: "Engineering", pageSize: 10 })),
    organization_stats: measure(() => getStats({ dbPath })),
    cohort_stats: measure(() => getStats({ dbPath, country: "Germany", department: "Engineering" })),
    csv_export: measure(() => exportEmployeesCsv({ dbPath })),
  };
  const queryPlan = openDatabase(dbPath).prepare(`EXPLAIN QUERY PLAN
    SELECT employee_id, base_salary_cents FROM employees
    WHERE country = ? AND department = ? ORDER BY base_salary_cents DESC LIMIT 25`).all("Germany", "Engineering");
  console.log(JSON.stringify({
    measured_at: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model },
    scope: "Local service calls on a temporary SQLite database; excludes HTTP, browser, and hosting latency",
    seed: { employees_inserted: inserted, history_rows: 10000, duration_ms: rounded(seedMs), second_run_inserted: reinserted, second_run_ms: rounded(seedAgainMs) },
    measurements,
    cohort_query_plan: queryPlan,
  }, null, 2));
} finally {
  closeAllDatabases();
  rmSync(directory, { recursive: true, force: true });
}

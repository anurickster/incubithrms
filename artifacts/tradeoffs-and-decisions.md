# Architecture Decision Records (ADRs) & Trade-Offs

## ADR-001: Backend Platform Migration to Node.js 22 LTS
* **Context:** The initial repository prototype used Python's `http.server` and standard library. The evaluation prompt specifically requested a Node.js backend.
* **Decision:** Re-architect the backend entirely in Node.js 22 LTS using native ESM (`import/export`).
* **Rationale:**
  - Modern Node.js provides a unified JavaScript/TypeScript toolchain across backend and frontend.
  - Asynchronous event-loop architecture delivers excellent I/O concurrency for concurrent HTTP client requests without thread pool overhead.
  - Full compatibility with existing npm packaging, Vite tooling, and Playwright automation.
* **Trade-offs:** Avoided complex Node frameworks (NestJS/TypeORM) in favor of lightweight native Node modules to keep code auditable, fast, and free of dependency rot.

---

## ADR-002: Native SQLite Storage (`node:sqlite`) vs External ORMs
* **Context:** A relational database was required to manage 10,000 employees with ACID compliance and local-first execution.
* **Decision:** Utilize Node.js 22's native `DatabaseSync` from `node:sqlite`.
* **Rationale:**
  - **Zero External Dependencies:** Eliminates reliance on `better-sqlite3` or `sqlite3` npm packages that require `node-gyp`, Python compile tools, and OS-specific C++ build chains.
  - **Single File Storage:** Easy to back up, copy, disposable for tests, and zero network configuration.
  - **In-Memory & Transaction Support:** Instant test runs using temporary test databases; prepared statements provide sub-millisecond execution.
* **Trade-offs:** Built-in `node:sqlite` is synchronous (`DatabaseSync`), which for a local-first SQLite embedded database on fast SSDs is actually an advantage (eliminating promise scheduling overhead), but would need connection pooling if migrated to client-server SQL engines like PostgreSQL in a distributed cloud deployment.

---

## ADR-003: Monetary Precision via Integer Minor Units (`cents`)
* **Context:** Floating-point numbers in IEEE 754 format (`0.1 + 0.2 === 0.30000000000000004`) introduce unacceptable accumulation errors in compensation calculations.
* **Decision:** All salaries are stored in the database as integer minor units (`base_salary_cents`), e.g., \$120,000.50 is stored as `12000050`.
* **Rationale:**
  - Guarantees exact integer arithmetic for calculations.
  - Integer comparisons and aggregations (`SUM`, `AVG`, `MIN`, `MAX`) in SQL are faster and immune to precision loss.
  - Decimal conversion occurs only at the API and UI boundaries.
* **Trade-offs:** Requires conversion when reading/writing; mitigated by centralized serializer/deserializer functions in `service.js`.

---

## ADR-004: Currency Segregation vs Dynamic FX Conversion
* **Context:** ACME operates across 10 countries with 9 distinct currencies (USD, GBP, EUR, CAD, AUD, INR, JPY, SGD, MXN).
* **Decision:** All statistics, averages, medians, and summaries are strictly grouped by currency. Compwise strictly forbids summing or comparing salaries across different currencies without explicit user-provided FX conversion.
* **Rationale:**
  - Without an official organizational FX reference rate and effective conversion date policy, summing 5,000,000 INR and 100,000 USD results in meaningless, deceptive totals.
  - HR managers comparing salaries across borders must look at local purchasing power and currency-specific market percentiles, not raw FX sums.
* **Trade-offs:** Dashboard cannot show a single "Total Global Payroll" number; instead, it presents an honest, accurate multi-currency benchmark table.

---

## ADR-005: Server-Side Indexed Pagination & Filtering
* **Context:** Rendering 10,000 DOM nodes in a browser causes severe UI lag, memory bloat, and battery drain.
* **Decision:** Implement server-side pagination with a default page size of 10 (configurable up to 100) and composite B-tree indexes.
* **Rationale:**
  - Browser memory consumption remains minimal and constant regardless of whether the org has 10,000 or 1,000,000 employees.
  - Network payload per request is under 5 KB.
* **Trade-offs:** Requires an extra query to calculate total count for pagination metadata; mitigated by covering index on `(last_name, first_name)`.

---

## ADR-006: Immutability of History & Strict Effective Dating
* **Context:** Spreadsheet edits silently overwrite previous values, losing historical context for raises and title changes.
* **Decision:** The `salary_history` and `audit_events` tables are strictly append-only.
* **Rationale:**
  - Every change creates a verifiable audit trail capturing previous salary, new salary, actor, and effective date.
  - Enforces that an effective date cannot be backdated before the current salary's effective date, preventing retroactive distortion of historical payroll records.

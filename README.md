# Compwise — ACME Salary Management & Compensation Intelligence

A local-first, high-performance salary management platform and compensation intelligence workspace built for ACME Corporation's HR Manager. Built with React 19, a dependency-free Node.js 22 LTS API with native SQLite (`node:sqlite`), and a repeatable 10,000-employee synthetic dataset.

> **Demo only:** All employee records are fictional and deterministic. There is no external production sign-in or network access. Do not enter real employee data or expose the server to an untrusted network.

---

## Quick Start

**Prerequisites:** Node.js 20.19+ (or Node.js 22 LTS recommended). Zero Python or external database dependencies required.

```sh
# 1. Install dependencies
npm install

# 2. Seed database (Optional: API auto-seeds on first launch if empty)
npm run seed

# 3. Start backend API (Terminal 1: http://127.0.0.1:8000)
npm run api

# 4. Start frontend Vite dev server (Terminal 2: http://127.0.0.1:5173)
npm run dev
```

To run a single-process production build preview, build the React app and start the API (the Node.js API serves `frontend/dist` directly):

```sh
npm run build
npm run api
```

To run against an isolated or disposable database, pass `SALARY_DB_PATH`:
```sh
SALARY_DB_PATH=/tmp/disposable-salaries.sqlite3 npm run api
```

---

## Answering "How ACME Pays People"

Designed specifically around the assessment problem statement: *"Currently, ACME org's HR team manages salary data for 10,000 employees across multiple countries via excels... We want the HR manager to manage salaries data via web-based software and be able to answer questions about how the org pays people."*

Compwise provides a dedicated **Pay Intelligence** engine to answer core strategic questions:
1. **Role & Title Pay Bands:** What are the minimum, median (midpoint), and maximum salary bands for Software Engineers, Product Managers, and other standardized roles across departments?
2. **Percentile Distributions & Equity:** Where do salaries fall across the 25th percentile (P25), median (P50), and 75th percentile (P75)? What is the pay dispersion ratio ($\text{Max} / \text{Min}$) for each currency?
3. **Cross-Cohort Analysis:** Select any operating Country and Department (e.g. *Engineering in India* or *Sales in the US*) to inspect localized medians, averages, and headcounts, and jump into the filtered directory with one click.
4. **Excel-Ready CSV Export:** One-click streaming CSV export matching active search queries and filters for offline executive briefings and compliance audits.

---

## Core Features & Workflow

- **High-Performance 10,000-Employee Directory:** Instant sub-10ms substring search across employee IDs, names, and emails; multi-faceted filtering by country, department, and currency; server-side sorting and bounded pagination.
- **Effective-Dated Salary Management:** Every compensation adjustment records a strict effective date ($YYYY-MM-DD$). Past and present dates are supported; future-dated changes are blocked from distorting current payroll baselines.
- **Immutable History & Audit Logging:** Previous salaries, new salaries, actors, and human-readable mutation notes are preserved in append-only `salary_history` and `audit_events` tables.
- **Currency-Safe Principles:** Total isolation of currencies. Salaries in different currencies (USD, GBP, EUR, INR, JPY, CAD, AUD, SGD, MXN) are never summed or converted using arbitrary FX rates without central bank exchange policy.
- **Integer Minor Units:** All monetary values are stored in the database as integer cents (`base_salary_cents`) to completely prevent IEEE 754 floating-point rounding errors.

---

## Architecture & Technology Stack

- **Backend:** Node.js (v22 LTS) using native `node:sqlite` (`DatabaseSync`), native `node:http`, and native `node:test`. Zero external npm runtime production dependencies for maximum auditability, security, and portability.
- **Database:** SQLite 3 with composite B-Tree indexes on `(last_name, first_name)`, `(country, department)`, `(currency)`, and `(employee_id, effective_date)`.
- **Frontend:** React 19 + Vite with responsive design, accessible forms, keyboard navigation, and live notification toasts.
- **Seeding:** High-performance prepared statement transaction inserting 10,000 employees and 10,000 baseline history rows in **< 60 milliseconds**.

Detailed design documents, ADRs, and diagrams are committed in the repository:
- [Product Requirements Document (PRD)](./docs/REQUIREMENTS.md)
- [System Architecture & Sequence Diagrams](./artifacts/architecture.md)
- [Architecture Decision Records & Trade-offs](./artifacts/tradeoffs-and-decisions.md)
- [Performance & Indexing Benchmark Report](./artifacts/performance-analysis.md)
- [AI Workflow & Prompt Engineering Notes](./artifacts/ai-workflow-prompts.md)

---

## API Specification

| Method | Path | Query / Body Parameters | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | None | Service readiness probe |
| `GET` | `/api/stats` | `country`, `department` (optional) | Headcount, salary percentiles (P25, median, P75), pay bands, and currency benchmarks |
| `GET` | `/api/employees` | `q`, `country`, `department`, `currency`, `sort`, `direction`, `page`, `page_size` | Paginated search, faceted filtering, and sorting across 10,000 employees |
| `GET` | `/api/employees/export` | `q`, `country`, `department`, `currency` | Streamed RFC-4180 CSV export for HR reporting |
| `GET` | `/api/employees/{id}` | None | Employee profile and chronological salary history |
| `PATCH` | `/api/employees/{id}` | `base_salary`, `currency`, `effective_date` | Atomic effective-dated salary update with audit event |

---

## Automated Test Suite

Compwise includes a fast, deterministic test suite covering domain validation, database constraints, seeding reproducibility, statistical calculations, and HTTP server lifecycle.

Run all tests via npm:

```sh
npm test
```

All 22 unit and integration tests execute in **< 250 milliseconds** with zero external dependencies.

---

## Automated Demo Video Recording

A Playwright script is included to automatically record a comprehensive browser walkthrough of the compensation dashboard, Pay Intelligence view, employee directory search, and atomic salary update:

```sh
npx playwright install chromium
npm run demo:video
```

The script boots an ephemeral Node.js API and Vite server, seeds a temporary database, interacts with the application, saves the recording to `artifacts/demo/compwise-walkthrough.webm`, and cleans up all temporary resources.

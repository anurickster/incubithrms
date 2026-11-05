# Compwise — ACME salary management

A local-first salary workspace for an HR manager. It includes a React dashboard, a Python standard-library API, and SQLite storage with a repeatable 10,000-employee synthetic dataset.

> **Demo only:** employee records are fictional. There is no sign-in or production access control. Do not enter real employee data or expose the development server to a network.

## Run locally

Requirements: Python 3.10+ and Node.js 20.19+.

```sh
npm install
npm run seed       # Optional: initialize the default SQLite database
npm run api         # Terminal 1: http://127.0.0.1:8000
npm run dev         # Terminal 2: http://127.0.0.1:5173
```

The API also initializes the schema and idempotently seeds missing demo records on startup, so the explicit seed command is optional. To use a disposable database, set `SALARY_DB_PATH` before starting the API:

```sh
SALARY_DB_PATH=/tmp/acme-salaries.sqlite3 npm run api
```

For a single-process production build preview, build the React app and then start the API; the API serves `frontend/dist` on port 8000:

```sh
npm run build
npm run api
```

## Features

- Search by employee name, ID, or email; filter by country, department, and currency; sort and paginate server-side.
- View employee details and the full effective-dated salary history.
- Update annual base salary, supported currency, and effective date. Changes are validated and recorded with an audit event.
- Compare average and median salaries by currency, country, and department. Every compensation statistic is grouped by currency; there is no cross-currency total or implicit FX conversion.
- Explore headcount across countries and departments. Seeded names, IDs, salaries, and hire dates are deterministic and fictional.

## Architecture and decisions

- **React 19 + Vite** provides a small responsive client without a heavyweight component framework. In development Vite proxies `/api` to the local service; a production build is served by that same service.
- **Python `http.server` + `sqlite3`** keeps the backend dependency-free and easy to run. The HTTP handler is intentionally local-only; SQLite transactions protect salary/history updates as one operation.
- **Integer minor units** (`base_salary_cents`) are used in storage to avoid floating-point arithmetic for salary edits. The API converts values to decimal currency units at the boundary.
- **Indexes and bounded pagination** support the 10k-person directory. Search terms and filters are bound SQL parameters, and sort fields are allow-listed.
- **Salary history and audit events** are append-only for each successful change. The demo actor is a fixed local label, not an authenticated user identity.

The app is not a payroll system. It intentionally excludes authentication, role management, bulk spreadsheet import/export, FX rates, tax/benefit calculations, and real employee information. See [the requirements](./docs/REQUIREMENTS.md) for the agreed scope and rationale.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Local service readiness |
| `GET` | `/api/stats` | Headcount and currency-safe compensation summaries |
| `GET` | `/api/employees` | Search, filter, sort, and paginate employees |
| `GET` | `/api/employees/{employee_id}` | Employee profile and salary history |
| `PATCH` | `/api/employees/{employee_id}` | Validate and record a salary change |

`GET /api/employees` accepts `q`, `country`, `department`, `currency`, `sort`, `direction`, `page`, and `page_size` query parameters. The page size is capped at 100. Salary updates require `base_salary`, `currency`, and `effective_date` (`YYYY-MM-DD`). Only changes effective today or earlier are accepted; future scheduling is deliberately unsupported, so reported current salaries cannot include a pending change. Unsupported currencies, invalid amounts, duplicate effective dates, backdated changes, and future dates return a JSON `400` error.

## Tests

```sh
python3 -m unittest backend.test_service backend.test_api -v
npm test
npm run build
```

The Python tests cover seed reproducibility/idempotency, salary validation and history, audit logging, server-side search and pagination, statistics grouping, and HTTP behavior. The frontend tests cover currency formatting and shared display helpers. All tests use local deterministic fixtures and need no external service.

## Demo recording

Install the Playwright Chromium browser once, then generate a browser walkthrough:

```sh
npx playwright install chromium
npm run demo:video
```

The script starts an isolated API and Vite server, seeds a temporary SQLite database, and records the overview, employee search, profile, and salary editor. It saves one salary change in that temporary database to demonstrate the complete workflow; the database is removed when recording finishes. The WebM video is written to `artifacts/demo/compwise-walkthrough.webm`.

## Deployment and next steps

Run the built app behind an organization-approved TLS reverse proxy only after adding SSO/authorization, operator-derived audit identities, backups, CSRF/origin protection, data-retention controls, and a security review. A cloud deployment is not configured in this repository because no deployment environment or credentials were supplied.

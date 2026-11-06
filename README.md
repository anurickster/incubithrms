# Compwise — ACME salary management

A React + Node.js application for an HR Manager to maintain annual base salaries and explore compensation across **10,000 fictional employees**, 10 countries, and 9 currencies. SQLite stores employee records, salary history, audit events, and retry responses.

**[Open the live app](https://compwise-acme-anurag.onrender.com)** — deployed on Render Free ($0/month).

The free service can take 50 seconds or more to wake after inactivity. Salary edits reset when the server restarts because SQLite uses temporary storage. All records are fictional. See [deployment and verification](docs/DEPLOYMENT.md).

**[Watch the demo video](artifacts/demo/compwise-walkthrough.webm)** · [One-page requirements](docs/REQUIREMENTS.md) · [Architecture](artifacts/architecture.md) · [Decisions](artifacts/tradeoffs-and-decisions.md) · [AI workflow](artifacts/ai-workflow-prompts.md)

All records are synthetic. There is no authentication or authorization, and “HR Manager” is a demonstration actor label. Use this app only with fictional data.

## Run locally

Use **Node 22.22.3**, pinned in `.node-version` and `.nvmrc`. Node 20 cannot run the native `node:sqlite` backend. The supported Node range is 22.13–22.x; the pinned version is the one validated for this submission.

```sh
nvm use                 # optional, if nvm is installed
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:8000**. The Node server serves both the built React UI and `/api`, and seeds the database on startup. Reseeding inserts only missing employees and preserves salary edits.

For frontend development, run `npm run api` and `npm run dev` in separate terminals, then open http://127.0.0.1:5173. Vite proxies `/api` to the backend. `SALARY_API_URL` can override the proxy destination.

| Setting | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | HTTP port; Render supplies its own value |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` on Render |
| `SALARY_DB_PATH` | `data/salaries.sqlite3` | SQLite path; free Render uses `/tmp/compwise/salaries.sqlite3` |
| `DEMO_EPHEMERAL_STORAGE` | unset | Set `true` to show the free-hosting reset notice |

`npm run seed` also runs the idempotent seed directly. To use an isolated database, set `SALARY_DB_PATH` before starting the API.

## Product walkthrough

1. **Overview:** inspect headcount and average salaries, reported separately by currency.
2. **Employees:** search, combine filters, paginate, open profiles, and export matching records to CSV.
3. **Salary edit:** enter a new annual base salary, currency, and effective date; save and inspect the preserved previous value in history.
4. **Pay Intelligence:** inspect observed role salary ranges and P25/median/P75 distributions. These are observed data, not approved compensation bands or an equity assessment.
5. **Cohort explorer:** select Germany + Engineering, see its exact headcount and median, and open the same 58 employees in the directory. Country benchmark includes all departments; cohort figures include only the selected country and department. Each currency remains separate if employees change currency.
6. Refresh a profile or cohort URL; the selected view remains available.

Effective dates use **UTC** in both UI and API. They must be later than the employee's current salary date and no later than today. Same-day corrections and future scheduling are deliberately excluded. Salaries use integer **hundredths** in SQLite; JPY is also represented using this fixed scale, rather than currency-specific minor-unit exponents.

## Verify

```sh
npm test                       # 41 unit/API/helper tests; temporary isolated databases
npm run test:coverage          # native Node coverage; does not include React rendering
npm run build
npx playwright install chromium
npm run test:e2e                # browser workflows through the Vite proxy
npm run test:e2e:production     # the same workflows through the built Node server
npm run benchmark              # reproducible local service benchmarks
```

Tests cover exact statistical values, country + department scope, seeding, validation, history/audit changes, atomic retry storage, conflicting idempotency requests, and existing database migration. Browser checks cover salary updates, profile/cohort refresh, keyboard focus trapping/restoration, navigation, and directory drill-down. Automated browser tests use isolated data and a disposable browser; interactive checks use the requested Chrome profile.

[GitHub Actions](.github/workflows/ci.yml) runs the unit/API tests, build, and both browser modes. A successful local run is separate from the remote CI result.

## API

| Method | Endpoint | Behavior |
|---|---|---|
| GET | `/api/health` | Database readiness and employee count |
| GET | `/api/stats?country=Germany&department=Engineering` | All counts, percentiles, ranges, and groups scoped to both optional filters |
| GET | `/api/employees` | `q`, `country`, `department`, `currency`, `sort`, `direction`, `page`, `page_size` |
| GET | `/api/employees/export` | CSV matching `q`, `country`, `department`, `currency`; generated in memory |
| GET | `/api/employees/:id` | Employee and salary history |
| PATCH | `/api/employees/:id` | `base_salary`, `currency`, `effective_date`; optional `Idempotency-Key` header |

Valid sort fields are `employee_id`, `name`, `country`, `department`, `base_salary`, and `currency`. Salary sorting compares nominal amounts, so filter to one currency for a meaningful ranking. Page size is 1–100. Validation errors return 400, missing employees 404, conflicting retry keys 409, and database readiness failures 503. `/api/v1/*` aliases the unversioned routes.

The browser retains a retry key for an unchanged salary submission after a failed response. The backend binds each key to the employee and normalized amount/currency/date. It writes the salary, history, audit event, and cached response in one transaction. Legacy cached keys without request fingerprints are rejected for safety; use a new key.

## Design and evidence

- [One-page requirements](docs/REQUIREMENTS.md): goal, scope, acceptance, and exclusions. The original requirements were committed before implementation; later refinements remain visible in Git history.
- [Architecture](artifacts/architecture.md) and [trade-offs](artifacts/tradeoffs-and-decisions.md): implementation boundaries and limitations.
- [Performance methodology and results](artifacts/performance-analysis.md): measured locally, not hosting or load-test guarantees.
- [AI workflow notes](artifacts/ai-workflow-prompts.md): how AI-assisted work was checked and corrected.
- [Submission checklist](docs/SUBMISSION.md) and [Render setup](docs/DEPLOYMENT.md).

`npm run demo:video` regenerates `artifacts/demo/compwise-walkthrough.webm` using a disposable database. The recording is an automated walkthrough without voice narration.

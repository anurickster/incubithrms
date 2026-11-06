# Free Render deployment

Status: **live and verified on 6 November 2026**.

**Live URL:** https://compwise-acme-anurag.onrender.com

Created in Anurag's Render account using the **Free ($0/month)** web-service plan, without a disk or paid add-ons. Service ID: `srv-dbmomkmi0phs73ceosk0`. The running application includes the salary concurrency and search improvements from implementation commit `4c9964a`. Documentation is maintained separately from application changes.

## Live verification

- Render reports the first deployment Live; health returns HTTP 200 and 10,000 employees.
- The React dashboard renders in Anurag's Chrome profile and displays the temporary-storage notice.
- Germany + Engineering: 58 employees, median EUR 103,062.36; the directory and 58-row CSV agree.
- Full-name search for Ethan Nakamura returns 21 matching employees in the live UI. A literal `%` search returns zero.
- Two one-cent adjustments on fictional employee `ACME-09992` retain three history records. Between them, a stale expected salary date returns HTTP 409 and preserves the latest salary; using the refreshed date succeeds.
- An identical keyed retry replayed the original response. Reusing the key with a different amount returned HTTP 409.
- [CI and browser workflow results](https://github.com/anurickster/incubithrms/actions/workflows/ci.yml).

These checks establish operation within the running instance, not durability through service restart. Raw evidence: [deployment-verification.json](../artifacts/deployment-verification.json), including the initial deployment and the `latest_review` record.

The salary dialog now shows save errors inline and offers a reload action on conflicts. Local development and production browser tests exercise stale-save rejection, reload, and successful resubmission. All 48 unit/API/helper tests pass.

The free assessment demo serves the React UI and Node API from one web service. It automatically seeds 10,000 fictional employees. **Salary edits reset when Render restarts the service**, including after idle shutdown, because free web services cannot attach a persistent disk. The UI displays this limitation. It is not suitable for real employee information.

## Configuration

| Field | Value |
|---|---|
| Repository | `https://github.com/anurickster/incubithrms` |
| Branch | `main` |
| Runtime | Node 22.22.3 from `.node-version` |
| Region | Singapore |
| Instance | **Free ($0)** |
| Build | `npm ci --include=dev && npm test && npm run build` |
| Start | `npm start` |
| Host | `0.0.0.0` |
| Port | Render's supplied `PORT` |
| Health check | `/api/health` |
| Database | `/tmp/compwise/salaries.sqlite3` (temporary storage) |
| Reset notice | `DEMO_EPHEMERAL_STORAGE=true` |
| Auto-deploys | Off |

[`render.yaml`](../render.yaml) declares this setup without any paid service or disk. The same values can be entered manually in the dashboard.

## Free-tier limits

Render spins down an inactive free web service after 15 minutes. A later request starts it again and can take around a minute to load. SQLite is recreated and reseeded when the temporary filesystem is replaced. The free database is not a durable ledger; do not expect edits to survive a service restart or redeploy. Free services also have monthly usage limits. Sources: [Render free services](https://render.com/docs/free), [persistent disks](https://render.com/docs/disks), [port binding](https://render.com/docs/web-services#port-binding), [Node version selection](https://render.com/docs/node-version).

To preserve salary edits across restarts, use a persistent disk on a paid service or redesign database access for a separate durable database. The free assessment deployment deliberately keeps the tested Node/SQLite application rather than introducing another database provider at submission time.

## Verify before submission

- [x] Confirm the actual HTTPS URL loads.
- [x] Check `/api/health` returns healthy with 10,000 employees.
- [x] Test directory filtering, cohort analytics, CSV export, and a synthetic salary update.
- [x] Reload the profile API and confirm updated history within the running instance.
- [x] Verify the UI reset notice is visible.
- [x] Record the deployed URL in README and the submission checklist.

Git repository code and local SQLite files remain persistent on the developer's computer. The reset limitation applies to the free hosted instance.

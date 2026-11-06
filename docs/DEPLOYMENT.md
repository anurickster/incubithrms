# Free Render deployment

Status: configuration prepared; deployment verification pending.

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

- Confirm the actual HTTPS URL loads; do not infer it from the service name.
- Check `/api/health` returns healthy with 10,000 employees.
- Test directory search/filter, cohort analytics, CSV export, and a synthetic salary update.
- Reload a profile URL and confirm the updated history within the running instance.
- Verify the UI reset notice is visible.
- Record the deployed URL in README and the submission checklist.

Git repository code and local SQLite files remain persistent on the developer's computer. The reset limitation applies to the free hosted instance.

# Render deployment setup

Status: prepared and locally verified; **not yet deployed**. Review the paid service and disk estimate in Render before creating resources.

## Configuration to review

The repository's [`render.yaml`](../render.yaml) creates one Node web service with the built React UI and API on the same origin:

| Field | Value |
|---|---|
| Git repository | `https://github.com/anurickster/incubithrms` |
| Branch | `main` |
| Runtime | Node 22.22.3 from `.node-version` |
| Region | Singapore |
| Instance | Starter (paid) |
| Build | `npm ci --include=dev && npm test && npm run build` |
| Start | `npm start` |
| Host | `0.0.0.0` |
| Port | Use Render's supplied `PORT` |
| Health check | `/api/health` |
| Persistent disk | 1 GB, mounted at `/var/data` |
| Database | `/var/data/salaries.sqlite3` |
| Auto-deploys | Off; deploy reviewed commits manually |

Render persistent disks require a paid service. Free instances use ephemeral storage, which would lose salary edits on restart/redeploy. Current pricing and the final estimate should be checked in the dashboard. Sources: [persistent disks](https://render.com/docs/disks), [web service port binding](https://render.com/docs/web-services#port-binding), [Node version selection](https://render.com/docs/node-version), [Blueprint specification](https://render.com/docs/blueprint-spec).

## Create after reviewing the setup

1. Sign in to [Render Dashboard](https://dashboard.render.com/) using Anurag's Chrome profile.
2. Create a **Blueprint** using the repository and `main`, or create a Node web service manually with the fields above. Grant repository access only if needed and review the requested scope.
3. Review the service and disk costs before applying. Do not select a static site: it cannot run this backend.
4. Apply the reviewed configuration. The database is created and seeded at runtime, when the persistent disk is mounted. Do not seed during the build.
5. Wait for a successful deployment and record Render's actual HTTPS URL. Do not assume the name is available.

## Verify the deployed app

- `/api/health` returns healthy and 10,000 employees.
- Overview, directory search/filter, CSV download, and Pay Intelligence load.
- Germany + Engineering contains 58 seeded employees and its analytics match the directory.
- Update a fictional employee's salary, inspect history, and reload the profile URL.
- Restart/redeploy the service; confirm that the salary edit and history persist and the seed does not overwrite them.
- Add the verified live URL at the top of README and mark the deployment item complete in `docs/SUBMISSION.md`.

## Operating limits

This is an unauthenticated synthetic-data demo. Do not upload real employee information. Use one service instance with its attached disk; this design does not support horizontal scaling. SQLite calls are synchronous, so long operations can block HTTP work. The disk prevents routine restart/redeploy data loss; it does not replace an application backup/restore procedure. Do not copy an active WAL database file alone as a backup. Render disk deployments can have brief downtime; no zero-downtime guarantee is made.

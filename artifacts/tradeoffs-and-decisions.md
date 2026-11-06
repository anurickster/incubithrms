# Engineering decisions and trade-offs

## Node and SQLite
The repository evolved from a Python prototype to a JavaScript backend. The assessment allows a backend appropriate to the applicant's role; it does not explicitly require Node. Native `node:http`, `node:sqlite`, and `node:test` keep the backend small. React and Vite provide the UI/toolchain, with Playwright for browser testing. Node 22.22.3 is pinned because `node:sqlite` is unavailable in Node 20.

SQLite fits a 10,000-row demonstration with one service instance. A Map reuses one synchronous handle per database path; it is a connection cache, not a concurrent connection pool. WAL helps other connections read during writes but does not make `DatabaseSync` asynchronous. A persistent disk supports service restarts. Multiple instances, sustained concurrent writes, and longer analytics would justify a client-server database or worker design. Fewer dependencies do not guarantee security or zero vulnerabilities.

## Salary representation and currency
Store integer hundredths instead of binary floating-point salary values. Inputs are bounded and converted at the boundary; aggregates round to hundredths. The fixed scale is also used for JPY and is not a claim to implement each currency's ISO minor-unit exponent. Statistics and cohort comparisons retain separate currencies; a global converted total needs an agreed FX source/date policy. Nominal salary sorting across currencies is available, so the README instructs users to filter by currency for comparable rankings.

Observed min/median/max salaries describe the dataset; they are not approved pay bands. Max/Min describes dispersion, not pay equity. Real equity analysis needs comparable role, level, experience, and other contextual factors absent from this dataset.

## Effective dates, history, and retries
Changes must be later than the current salary date and no later than today in UTC. One record per employee/date is deliberately simple; same-day corrections and scheduled changes need a revision policy. This restriction is explicit in the requirements and UI.

Salary, history, audit, and optional retry response are stored in the same `BEGIN IMMEDIATE` transaction. Replay checks and current salary reads occur after taking the write lock. Keys are bound to employee and normalized payload; conflicting reuse returns 409. Legacy unbound keys are rejected. The browser includes `expected_salary_effective_date` as an optimistic concurrency token. Its comparison occurs inside the same transaction; stale forms receive 409 and a reload action. Salary dates are monotonic because same-date changes are disallowed. The token is optional for legacy API compatibility, so production clients should require it. Keys currently have no expiry/retention cleanup. The browser reuses a key for an unchanged failed submission; durable retry recovery after a full browser restart is not implemented.

## Search, CSV, and analytics
Server pagination bounds DOM and payload size. Indexed country/department equality filters are inexpensive at this scale. Substring `LIKE '%text%'` search scans rows; the name index does not turn it into an indexed full-text search. A larger dataset would need a measured search strategy. CSV export is buffered in memory, not streamed. At 10,000 rows the measured export is about 1.2 MB; a larger dataset would justify streaming. There is no employee import endpoint, so arbitrary imported spreadsheet content is outside this release.

## Demo access and hosting
The app has no authentication, role enforcement, approvals, or real user identity. “Local HR Manager” is an actor label. All seed records are fictional and the UI is marked demo data. Real deployment with employee information needs organization-specific access control, privacy policies, backups, and approval workflows. Public assessment hosting must continue to use synthetic data only.

Render's free filesystem does not preserve edits through restart/redeploy. The user subsequently requested a free deployment. The configuration now selects a free service with temporary SQLite storage and a visible reset notice; edits do not survive hosted service restarts. This is an explicit assessment-demo limitation. Durable hosted storage would need an external database or a paid disk. Automatic deploys remain disabled.

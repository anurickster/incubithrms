# Test evidence — reliability review

Application changes: commit `4c9964a` (6 November 2026). Commands ran locally on Node 22.22.3 with isolated temporary databases. GitHub Actions independently runs the same core suite, build, and both browser modes; its result is visible through the README badge.

| Check | Observed result |
|---|---|
| `npm test` | 48 passed, zero failed; approximately 0.33 seconds in this run |
| `npm run test:coverage` | 48 passed with Node's native line/branch/function report |
| `npm run build` | Production bundle built successfully |
| `npm run test:e2e` | Vite-proxy browser workflows passed |
| `npm run test:e2e:production` | Built Node-server browser workflows passed |
| `node scripts/benchmark.js` | Temporary 10,000-employee dataset; raw timings in `performance-results.json` |

## Scoped coverage

These values come from the local native Node report. They exclude React component rendering and browser execution; they are not whole-application coverage. Test-file coverage is intentionally omitted from this table.

| Backend source | Line coverage | Branch coverage |
|---|---:|---:|
| `service.js` | 97.16% | 89.58% |
| `database.js` | 91.33% | 72.22% |
| `seed.js` | 94.83% | 88.24% |
| `server.js` | 66.36% | 75.47% |

The HTTP-handler tests use in-process request/response streams; browser tests additionally exercise real servers and the built UI. No load test, security audit, or full React component-coverage claim is made.

## Meaningful regression scenarios

- Exact mean/P25/median/P75 for a small known fixture, independent of the production calculation.
- Country + department scope agrees with directory and CSV records, without mixing EUR employees from another country.
- A deliberately failed retry-cache insertion rolls back employee, history, and audit changes.
- Identical retries replay once; another employee or changed payload cannot reuse the key.
- An old salary form cannot overwrite a change that advanced the current salary date. A browser test observes 409, visible dialog error, reload, and successful resubmission.
- Full-name search and literal `%`, `_`, and backslash handling agree between directory and CSV.
- Descending name sort works, and inherited object keys cannot enter the sort allowlist.
- Profile and cohort URLs survive refresh; modal Tab/Shift+Tab wrapping, Escape, and focus restoration execute in a real browser.
- Reseeding after reopening the local database preserves existing salary edits and their audit history.

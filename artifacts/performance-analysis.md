# Reproducible performance evidence

Run `npm run benchmark` to measure service calls against a freshly seeded, temporary SQLite database. Raw results are committed in [performance-results.json](performance-results.json), including timestamp, Node/platform/CPU, sample counts, payload sizes, and query plan.

The recorded run used Node 22.22.3 on an Apple M4. It inserted 10,000 employees and 10,000 baseline history records in about 63 ms; a second seed inserted zero employees. Each query measurement warms up five times, then samples 20 calls and reports median and P95. This is a local microbenchmark, not an HTTP load test or deployed performance guarantee.

| Operation | Median | P95 | Response bytes |
|---|---:|---:|---:|
| Directory, 10 rows | 0.037 ms | 0.053 ms | 2,929 |
| Substring search | 1.313 ms | 1.477 ms | 2,920 |
| Germany + Engineering directory | 0.049 ms | 0.083 ms | 2,955 |
| Organization statistics | 11.866 ms | 13.069 ms | 73,845 |
| Germany + Engineering statistics | 0.101 ms | 0.110 ms | 1,432 |
| Full CSV export | 16.161 ms | 17.917 ms | 1,226,771 |

Compression sizes in the raw JSON are estimates from Node's gzip function. The application server does not itself apply gzip; estimates are not observed network payloads.

## Why these operations are bounded

- Country + department filtering uses `idx_employees_country_department`. The recorded query plan also shows a temporary B-tree for salary ordering; that sort is not covered by the filter index.
- Substring search scans employees. At 10,000 rows this is acceptable in the measured environment; no indexed full-text-search claim is made.
- Analytics read sorted salary values and group them in Node by currency. All counts and groups apply the requested cohort filters.
- Pagination bounds the employee table to ten rows by default. This is pagination, not DOM virtualization, and total DOM-node counts were not benchmarked.
- Search input is debounced by 250 ms. Directory response generation checks and cohort request cancellation prevent obsolete results from replacing the current selection.

## Limits and next measurements

HTTP parsing, TLS, network latency, disk contention, concurrent clients, startup/build time, and browser rendering are excluded. `DatabaseSync` blocks Node's event loop while executing. CSV generation and organization-wide analytics buffer data in memory. No million-employee scalability, multi-instance concurrency, or sub-10-ms end-to-end guarantee is claimed. After deployment, measure actual request latency and check persistence through a restart before reporting hosted readiness.

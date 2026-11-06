# AI-assisted workflow and verification

The assessment requires intentional AI use. This document records the approach and current review evidence; it does not claim that every historical prompt below is an exact transcript.

## Development history
The Git history records requirements before implementation, an initial working UI/API, effective-date and refresh corrections, demo recording, migration from Python to native Node/SQLite, modular UI/analytics, URL state, and backend hardening. The design was refined in later commits rather than rewriting that history.

Earlier development used AI to help frame scope, create backend/schema/test code, split React components, and add salary analytics. These are reconstructed task summaries, not verbatim prompts:
- Define HR salary-management workflows, currency boundaries, exclusions, and acceptance criteria.
- Implement and test a relational employee directory, effective-dated salary changes, and grouped statistics.
- Add overview, directory, salary editor, analytics, loading/error states, and a demo script.

## Submission review and correction, 6 November 2026
The user supplied the complete assessment and requested a repository review, then authorized the fixes: “ok do all the things and use Anurag Chrome profile for browser things”. They initially selected “Use Render; prepare setup first”, then requested a free deployment. They clarified that this is a personal repository, without Azure work-item metadata.

The review agent read the source, requirements, artifacts, and commit history; ran tests/build/browser scripts; and reproduced suspected bugs with a disposable database. Passing tests did not establish correctness: the review found ignored statistics filters, a reused key returning another employee's response, and employee deep links being removed before profile loading.

Corrections and checks:
- Country + department statistics now match the directory. An exact fixture checks mean/P25/median/P75, and a browser regression checks Germany + Engineering has 58 employees with median EUR 103,062.36.
- Retry keys now bind employee and normalized payload and commit with the mutation. Tests deliberately fail cache insertion to verify salary/history/audit rollback.
- Profile URL state is preserved through initial load and refresh. URL/date tests import the production helpers instead of copying their implementations.
- Browser tests exercise real Tab/Shift+Tab wrapping and focus restoration. Testing the built production server exposed a timing issue; modal loading/focus initialization was corrected before rerunning.
- Performance claims were replaced with an executable benchmark, raw measured results, and explicit limits.
- Render infrastructure is prepared for review; deployment completion is tracked separately from local validation.

Interactive browser checks use Anurag's Chrome profile. Automated tests and video recording use a disposable browser and temporary synthetic database. No genuine employee data is sent to an AI service by the application, and the product has no LLM integration.

## Remaining human decisions
Complete the free Render sign-in/deployment, verify the live service and visible temporary-storage limitation, and send the final repository/live-app/video links in the original email thread. These steps are not implied by a local test pass.

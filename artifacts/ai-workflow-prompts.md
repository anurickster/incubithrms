# AI Workflow & Prompt Engineering Notes

## 1. Intentional AI Engineering Approach
In accordance with the assessment expectations, AI was used intentionally across all phases of the project lifecycle to accelerate development while enforcing rigorous software engineering standards, test verification, and architectural clarity.

---

## 2. Structured Prompts & Execution Phases

### Phase 1: Requirements Discovery & Domain Modeling
* **Goal:** Extract implicit HR compensation domain requirements and define clean boundaries.
* **Prompt Used:**
  > "Act as a Senior Compensation Director and Principal Software Architect. Analyze the problem of managing salary data for 10,000 employees across 10 international jurisdictions. Identify the key questions an HR manager needs to answer, potential currency traps (e.g. invalid FX blending), and edge cases in effective-dated salary records. Formulate a 1-page PRD highlighting scope, non-goals, and rationale."
* **Human Validation & Refinement:**
  - Enforced strict segregation of currencies (rejecting arbitrary FX conversion).
  - Defined explicit rules for effective dating (no backdating behind current effective date, no future dates).

### Phase 2: Architecture & Migration to Node.js
* **Goal:** Design an idiomatic Node.js 22 backend replacing the legacy Python prototype with zero external production dependencies.
* **Prompt Used:**
  > "Design an enterprise-grade Node.js service using native Node 22 `node:sqlite` (`DatabaseSync`), native `node:http`, and `node:test`. The service must handle 10,000 seeded employees, fast indexed search, bounded pagination, atomic multi-table transactions for salary updates, and statistical aggregations (mean, median, P25, P75). Ensure zero external npm production dependencies."
* **Human Validation & Refinement:**
  - Audited `node:sqlite` transaction handling to guarantee rollback on constraint violations.
  - Verified monetary calculations use integer cents to prevent floating point inaccuracies.

### Phase 3: Test-Driven Verification & Edge Cases
* **Goal:** Build an exhaustive, fast, and deterministic test suite.
* **Prompt Used:**
  > "Generate a comprehensive unit and integration test suite using `node:test` and `node:assert/strict`. Cover:
  > 1. Seed determinism and idempotency across 10,000 rows.
  > 2. Edge-case validation: negative salaries, NaN, non-string dates, leap days, future dates, duplicate same-day edits.
  > 3. HTTP status codes (200, 400, 404) and JSON error response structures.
  > 4. Server-side pagination bounds checking."
* **Human Validation & Refinement:**
  - Added specific test assertions verifying previous salary cents are preserved as null on first seed and correct on subsequent updates.

### Phase 4: Frontend Component Decomposition & Analytics UX
* **Goal:** Modularize the monolithic React UI and introduce the "How ACME Pays" interactive intelligence view.
* **Prompt Used:**
  > "Refactor the UI to provide the HR manager with actionable answers to compensation questions: show pay percentiles (P25, median, P75), pay dispersion, country/department benchmarks, and a direct CSV cohort export. Maintain high accessibility, responsive CSS, and clear visual state management."
* **Human Validation & Refinement:**
  - Preserved the elegant design language while modularizing components for long-term maintainability.


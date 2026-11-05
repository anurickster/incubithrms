# ACME Salary Management (Compwise) — Product Requirements Document (PRD)

## 1. Executive Summary & Goal
ACME Corporation employs 10,000 people across 10 international offices. Currently, compensation data is maintained through disparate, fragile Excel spreadsheets managed by regional teams. This approach causes data inconsistency, accidental overwrites, lack of auditability, and inability for the HR leadership to answer strategic compensation questions.

**Goal:** Build a robust, web-based salary management application tailored for ACME's **HR Manager** to:
1. Maintain accurate base salary data for 10,000 employees with strict validation and effective-dated audit trails.
2. Answer critical questions on how ACME pays its workforce (pay distributions, medians, percentiles, and pay equity across countries and departments).
3. Replace manual spreadsheet workflows with an intuitive, responsive, and secure single-source-of-truth.

---

## 2. User Persona & Problem Framing
- **User Persona:** HR Manager (Global People Operations).
- **Core Need:** A single pane of glass to search 10,000 employees instantly, update compensation without formula errors, trace historical adjustments, and deliver compensation insights to executive leadership without writing spreadsheet formulas.
- **Key Questions the HR Manager Needs to Answer:**
  - *Distribution & Averages:* What are the average and median salaries in each country and department?
  - *Pay Spread & Dispersion:* What is the 25th percentile (P25) and 75th percentile (P75) spread for roles within each currency?
  - *Location & Headcount:* How is headcount distributed globally across our 10 operating countries and 10 departments?
  - *Audit & Progression:* When was an employee's salary last updated, who approved it, and what was their compensation trajectory?
  - *Reporting:* Can we export filtered employee cohorts to CSV for external compliance and executive presentations?

---

## 3. Scope & Key Features

### 3.1 Data Ingestion & Deterministic Seeding
- **10,000 Synthetic Employees:** Seed script generating exactly 10,000 realistic, deterministic records spanning 10 countries (US, UK, India, Germany, France, Canada, Australia, Japan, Singapore, Mexico) and 10 core departments.
- **Relational Integrity:** SQLite schema enforcing primary keys, unique corporate emails, non-null foreign keys, positive salary values, and 3-letter ISO currencies.
- **Minor-Unit Precision:** Salary stored as integer minor units (`base_salary_cents`) to completely eliminate IEEE 754 floating-point rounding errors.

### 3.2 Employee Directory & Search
- **Sub-10ms Server-Side Search:** Full substring search over Employee ID, first name, last name, and email.
- **Multi-Faceted Filtering:** Real-time filtering by country, department, and currency.
- **Server-Side Sorting & Bounded Pagination:** Sort by ID, Name, Department, Location, Base Salary, and Effective Date with page sizes bounded between 1 and 100.
- **Cohort CSV Export:** Export current filtered directory to standard CSV for offline executive reporting.

### 3.3 Salary Management, Effective Dating & Audit History
- **Effective-Dated Records:** Every compensation change requires an effective date ($YYYY-MM-DD$). Past and present dates are supported; future-dated changes are blocked from affecting current payroll baselines.
- **Historical Immutability:** Previous salaries are archived into an append-only `salary_history` table preserving previous salary, new salary, currency, effective date, and actor.
- **Audit Logging:** System logs every mutation to an `audit_events` table with actor context, timestamp, and human-readable mutation summary.
- **Validation Guardrails:**
  - Rejection of negative, zero, non-numeric, or malformed salary figures.
  - Maximum of 2 decimal places.
  - Strict currency code validation against supported currencies.
  - Prevention of backdated updates earlier than the current effective date.
  - Prevention of duplicate updates on the same effective date without intervening change.

### 3.4 Compensation Analytics ("How ACME Pays")
- **Currency-Safe Aggregations:** Total segregation of currencies. Salaries are never converted via arbitrary exchange rates or added across currencies without verified FX benchmarks.
- **Deep Statistical Metrics:** Mean, median, P25, P75, minimum, maximum, and headcount calculated across every currency cohort.
- **Interactive Drill-Downs:** Country-by-country and department-by-department compensation benchmarks.

---

## 4. Deliberately Out of Scope & Rationale

| Feature | Rationale for Exclusion |
|---|---|
| **Automated FX Conversion & Global Consolidated Total** | Without a real-time, dated central bank FX feed and organizationally agreed hedging policies, summing USD and INR creates misleading vanity metrics that misinform executive pay decisions. |
| **Gross-to-Net Payroll & Tax Calculations** | Tax withholdings, national pensions (e.g., 401k, PF, Superannuation), and benefits vary across 10 tax jurisdictions. Compwise manages *base compensation*, not payroll disbursements. |
| **Public Multi-Tenant Authentication (OAuth/SSO)** | In an enterprise HR context, auth should integrate into corporate Okta/Azure AD at the infrastructure/reverse-proxy layer. Local MVP uses a trusted local HR Manager context to keep setup dependency-free. |
| **Future-Dated Scheduled Adjustments** | Allowing pending future salaries without an event scheduler creates race conditions where reporting tools report inaccurate current operational costs. |
| **Bulk Excel Spreadsheet Upload** | Spreadsheet imports reintroduce dirty data, unvalidated formats, and duplicate records. Manual edits via validated UI and CSV export maintain database cleanliness. |

---

## 5. Technical Architecture & Constraints
- **Backend:** Node.js (v20+ LTS) using native `node:sqlite` (`DatabaseSync`), native `node:http`, and native test runner (`node:test`). Zero external production dependencies for maximum security, portability, and zero-vulnerability audit.
- **Database:** SQLite with indexed B-trees on `(country, department)`, `(last_name, first_name)`, `(currency)`, and `(employee_id, effective_date)`.
- **Frontend:** React 19 + Vite with responsive design, accessible forms, live feedback alerts, and statistical visualizations.
- **Testing:** 100% deterministic unit and integration test suite with isolated in-memory or temporary disk databases executing in <1 second.

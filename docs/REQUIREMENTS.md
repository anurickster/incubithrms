# Compwise — one-page requirements

## Goal and user
Give ACME's HR Manager one web workspace to maintain annual base salaries for 10,000 employees across countries and answer how the organization pays people. Replace fragile spreadsheet edits with validated records, clear salary distributions, and traceable changes.

## Scope and main workflows
- Seed exactly 10,000 fictional employees into a relational SQLite database. The seed is deterministic and can be rerun without overwriting salary edits.
- Search employees by ID, full name, first name, last name, or email; filter by country, department, and currency; sort and paginate on the server.
- Open an employee profile and update annual base salary, currency, and effective date. Preserve the previous value, actor label, and change time in history and audit records.
- Answer: how many employees work in each country/department; what are average, median, P25, P75, minimum, and maximum salaries within a currency; and how does a selected country + department compare with its country benchmark?
- Drill from a cohort into the matching directory and export the active search/filter results to CSV.
- Provide clear loading, empty, error, and success states, keyboard-accessible salary dialogs, and shareable URLs that survive refresh.
- Deliver a deployed React + Node application, setup instructions, automated tests, design/AI notes, and a short demo video.

## Business rules and acceptance
Salary must be positive, at most 1,000,000,000, and contain no more than two decimal places. Store fixed hundredths as integers. Effective dates use UTC and must be after the current salary date and no later than today. One change per employee per effective date is supported. A successful change and its history, audit event, and optional retry key commit together. Repeating an identical keyed request returns its original result; conflicting reuse returns HTTP 409. Browser edits include the salary date originally read; stale edits return 409 and offer reload.

Statistics always separate currencies. Country + department analytics must use exactly the same population as the directory. Percentiles use linear interpolation on sorted salary values, rounded to hundredths. Max/Min describes dispersion, not proof of equitable pay. A fresh local setup must seed 10,000 employees, preserve edits across restart/reseed, and pass core unit/API and browser workflow tests.

## Deliberately excluded, with reasons
- Payroll disbursement, taxes, benefits, bonuses, and compensation recommendations: country policy and approval requirements exceed base-salary management.
- FX conversion and a combined global salary total: no agreed exchange-rate source or date policy was supplied.
- Bulk Excel import and employee creation/deletion: validation and reconciliation need a separate import design; this release manages seeded employee salaries.
- Future scheduling and same-day correction workflows: require explicit revision/activation policy. Existing history is retained rather than silently rewritten.
- Production identity, roles, approvals, and real employee data: this is a clearly labeled synthetic-data assessment demo, not a production HR deployment. The displayed HR actor is not an authenticated identity.

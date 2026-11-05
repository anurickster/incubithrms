# ACME Salary Management — requirements

## Goal

Give ACME's HR manager a dependable web application to maintain the base salaries of 10,000 employees and answer basic questions about how the organization pays people. Replace spreadsheet editing with searchable, validated, auditable records.

## Users and scope

The MVP is for an authorized HR manager using one organization-wide workspace. It manages synthetic employee records for development and demonstrations. Salary amounts are stored and reported in their original currency; values in different currencies are never added together or presented as a converted total.

## In scope

- Seed exactly 10,000 deterministic, synthetic employees into a relational SQLite database.
- Browse, search, filter, sort, and paginate employees by name/ID, country, department, and currency.
- View and edit an employee's current base salary, currency, and effective date with server-side validation.
- Preserve salary changes as dated history and record who/what changed the data.
- Summarize headcount and salary statistics by country, department, and currency. Show average and median only within a single currency group.
- Provide a responsive dashboard, useful empty/error/loading states, and a clear indication that seeded data is synthetic.
- Include automated tests for salary validation/history, filtering/pagination, and currency-safe summaries; document local setup and operation.

## Deliberately out of scope

- Payroll calculation, tax, benefits, bonuses, compensation recommendations, and payroll-provider integrations: these require jurisdiction-specific policy and are not necessary to replace the salary spreadsheet.
- Foreign-exchange conversion or a global salary total: without an agreed exchange-rate source and date policy, such figures are misleading.
- Employee self-service, bulk spreadsheet import/export, and real employee data: they expand privacy, authorization, and data-integrity requirements beyond this demonstration.
- Production identity management, multi-tenant access control, and cloud deployment: these require organization-specific credentials, infrastructure, and security review. The local demo must not be used for real compensation data.
- General HRIS features such as hiring, performance, and organizational planning.

## Quality and acceptance criteria

- A fresh local setup can initialize and seed the database, start the API and UI, and use all in-scope workflows without external services.
- The seed is reproducible and idempotent; database constraints and API validation reject invalid or ambiguous salary changes.
- Changing salary creates an effective-dated history record; summaries never combine currencies.
- Tests run locally, deterministically, without network access, and cover core business rules.

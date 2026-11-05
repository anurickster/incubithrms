# Compwise System Architecture

## 1. High-Level System Architecture

Compwise is built as a modular, local-first enterprise compensation platform designed to process 10,000 employee records with sub-millisecond query responses and zero external service dependencies.

```mermaid
flowchart TD
    subgraph Client ["Client Tier (React 19 + Vite)"]
        UI["Compwise Single Page App"]
        Overview["Overview Dashboard"]
        Directory["Employee Directory & Search"]
        PayAnalytics["'How We Pay' Intelligence"]
        ProfileModal["Profile & Salary Editor Modal"]
    end

    subgraph Server ["Backend Tier (Node.js 22 LTS)"]
        Router["HTTP Request Router (node:http)"]
        StaticServe["SPA Static Asset Server"]
        ValidationMiddleware["Payload & Parameter Validator"]
        SalaryService["Salary Domain Service"]
        StatsEngine["Statistical Computation Engine"]
        CSVExport["RFC-4180 Streaming CSV Generator"]
    end

    subgraph Data ["Persistence Tier (SQLite 3 via node:sqlite)"]
        DB[(salaries.sqlite3)]
        TableEmployees["employees (10,000 rows)"]
        TableHistory["salary_history (Audit Trail)"]
        TableAudit["audit_events (Compliance Log)"]
        Indexes["B-Tree Indexes (Composite & Covering)"]
    end

    UI --> Router
    Router --> StaticServe
    Router --> ValidationMiddleware
    ValidationMiddleware --> SalaryService
    SalaryService --> StatsEngine
    SalaryService --> CSVExport
    SalaryService --> DB
    DB --- TableEmployees
    DB --- TableHistory
    DB --- TableAudit
    DB --- Indexes
```

---

## 2. Database Schema & Entity Relationship

```mermaid
erDiagram
    EMPLOYEES ||--o{ SALARY_HISTORY : "tracks historical changes"
    EMPLOYEES ||--o{ AUDIT_EVENTS : "records change reasons"

    EMPLOYEES {
        string employee_id PK "ACME-XXXXX format"
        string first_name "Given name"
        string last_name "Surname"
        string email UK "Corporate email"
        string country "Operating country (10 countries)"
        string department "Department (10 departments)"
        string job_title "Standardized role title"
        string hire_date "ISO date (YYYY-MM-DD)"
        integer base_salary_cents "Stored in minor units (cents)"
        string currency "3-letter ISO code"
        string salary_effective_date "Date when current salary took effect"
    }

    SALARY_HISTORY {
        integer id PK "Autoincrement"
        string employee_id FK "References employees.employee_id"
        integer previous_salary_cents "Null for initial seed"
        integer new_salary_cents "Validated positive cents"
        string previous_currency "Previous 3-letter currency"
        string new_currency "New 3-letter currency"
        string effective_date "Effective date of change"
        string actor "Who initiated change"
        string changed_at "Timestamp of record creation"
    }

    AUDIT_EVENTS {
        integer id PK "Autoincrement"
        string employee_id FK "References employees.employee_id"
        string event_type "e.g. salary.updated"
        string actor "e.g. Local HR Manager"
        string details "Human-readable summary of transition"
        string created_at "Audit timestamp"
    }
```

---

## 3. Salary Mutation Workflow & Transaction Boundary

To guarantee zero data loss, the salary update workflow enforces transactional atomicity across three database tables:

```mermaid
sequenceDiagram
    autonumber
    actor HR as HR Manager (Client UI)
    participant API as Node.js HTTP Server
    participant Val as Validation Layer
    participant Svc as Salary Service
    participant DB as SQLite Database

    HR->>API: PATCH /api/employees/{id} (new salary, currency, effective_date)
    API->>Val: Validate request payload & bounds
    alt Payload invalid (bad amount, future date, invalid currency)
        Val-->>HR: 400 Bad Request with error explanation
    end
    Val->>Svc: updateSalary(employeeId, payload)
    Svc->>DB: BEGIN IMMEDIATE TRANSACTION
    Svc->>DB: SELECT current base_salary_cents, currency, effective_date FOR employee
    alt Employee Not Found
        Svc-->>HR: 404 Not Found
    else Date is older or equal to current date
        Svc-->>HR: 400 Bad Request (Cannot backdate or duplicate)
    end
    Svc->>DB: UPDATE employees SET base_salary_cents=?, currency=?, salary_effective_date=?
    Svc->>DB: INSERT INTO salary_history (...)
    Svc->>DB: INSERT INTO audit_events (...)
    Svc->>DB: COMMIT TRANSACTION
    Svc->>DB: SELECT updated employee with full history
    Svc-->>HR: 200 OK (Updated employee profile & chronological history)
```

---

## 4. API Specification

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Service readiness probe |
| `GET` | `/api/stats` | `country`, `department` (optional) | Returns org-wide and cohort compensation statistics (P25, median, mean, P75, min, max, headcount) |
| `GET` | `/api/employees` | `q`, `country`, `department`, `currency`, `sort`, `direction`, `page`, `page_size` | Paginated search and faceted filter across 10,000 employees |
| `GET` | `/api/employees/export` | `q`, `country`, `department`, `currency` | Streamed RFC-4180 compliant CSV export for HR reporting |
| `GET` | `/api/employees/:id` | None | Fetch employee record with full chronological salary history |
| `PATCH` | `/api/employees/:id` | None | Atomic effective-dated salary update with audit trail |

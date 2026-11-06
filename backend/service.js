import { openDatabase, initializeDatabase } from "./database.js";

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export const SORT_COLUMNS = {
  employee_id: "employee_id",
  name: "last_name COLLATE NOCASE",
  country: "country COLLATE NOCASE",
  department: "department COLLATE NOCASE",
  base_salary: "base_salary_cents",
  currency: "currency",
};

export const SUPPORTED_CURRENCIES = new Set([
  "AUD", "CAD", "EUR", "GBP", "INR", "JPY", "MXN", "SGD", "USD"
]);

function toEmployeeDto(row) {
  const { base_salary_cents, ...rest } = row;
  return {
    ...rest,
    base_salary: base_salary_cents / 100,
  };
}

export function validateSalaryInput(value) {
  if (value === null || value === undefined || typeof value === "boolean") {
    throw new ValidationError("Salary must be a positive number.");
  }
  const str = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new ValidationError("Salary must be a positive number.");
  }
  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0 || num > 1_000_000_000) {
    throw new ValidationError("Salary must be greater than 0 and no more than 1,000,000,000.");
  }
  const parts = str.split(".");
  if (parts.length === 2 && parts[1].length > 2) {
    throw new ValidationError("Salary must have no more than 2 decimal places.");
  }
  return Math.round(num * 100);
}

export function validateEffectiveDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") {
    throw new ValidationError("Effective date is required in YYYY-MM-DD format.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new ValidationError("Effective date must be a valid YYYY-MM-DD date.");
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new ValidationError("Effective date must be a valid YYYY-MM-DD date.");
  }

  const now = new Date();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  if (dateStr > todayStr) {
    throw new ValidationError("Future salary changes are not supported.");
  }
  return dateStr;
}

export function listEmployees({
  dbPath,
  query = "",
  country = "",
  department = "",
  currency = "",
  sort = "employee_id",
  direction = "asc",
  page = 1,
  pageSize = 25,
} = {}) {
  const pageNum = Number(page);
  const sizeNum = Number(pageSize);

  if (!Number.isInteger(pageNum) || pageNum < 1) {
    throw new ValidationError("Page must be at least 1.");
  }
  if (!Number.isInteger(sizeNum) || sizeNum < 1 || sizeNum > 100) {
    throw new ValidationError("Page size must be between 1 and 100.");
  }
  if (!SORT_COLUMNS[sort]) {
    throw new ValidationError("Unsupported sort field.");
  }
  const normalizedDirection = String(direction).toLowerCase();
  if (normalizedDirection !== "asc" && normalizedDirection !== "desc") {
    throw new ValidationError("Sort direction must be asc or desc.");
  }

  const clauses = [];
  const params = [];

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    clauses.push(
      "(employee_id LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)"
    );
    const pattern = `%${trimmedQuery}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  if (country) {
    clauses.push("country = ?");
    params.push(country);
  }
  if (department) {
    clauses.push("department = ?");
    params.push(department);
  }
  if (currency) {
    clauses.push("currency = ?");
    params.push(currency.toUpperCase());
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  let orderClause = SORT_COLUMNS[sort];
  if (sort === "name") {
    orderClause += ", first_name COLLATE NOCASE";
  }

  const db = openDatabase(dbPath);
  try {
    const countSql = `SELECT COUNT(*) AS total FROM employees${whereClause}`;
    const countRow = db.prepare(countSql).get(...params);
    const total = countRow ? Number(countRow.total) : 0;

    const limitOffsetParams = [...params, sizeNum, (pageNum - 1) * sizeNum];
    const selectSql = `
      SELECT employee_id, first_name, last_name, email, country, department,
             job_title, hire_date, base_salary_cents, currency, salary_effective_date
      FROM employees${whereClause}
      ORDER BY ${orderClause} ${normalizedDirection.toUpperCase()}, employee_id ASC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(selectSql).all(...limitOffsetParams);
    return {
      employees: rows.map(toEmployeeDto),
      total,
      page: pageNum,
      page_size: sizeNum,
      pages: Math.ceil(total / sizeNum) || 0,
    };
  } finally {
    db.close();
  }
}

export function getEmployee(employeeId, dbPath) {
  const db = openDatabase(dbPath);
  try {
    const employeeRow = db
      .prepare("SELECT * FROM employees WHERE employee_id = ?")
      .get(employeeId);
    if (!employeeRow) return null;

    const historyRows = db
      .prepare(`
        SELECT id, previous_salary_cents, new_salary_cents, previous_currency, new_currency,
               effective_date, actor, changed_at
        FROM salary_history
        WHERE employee_id = ?
        ORDER BY effective_date DESC, id DESC
      `)
      .all(employeeId);

    const employee = toEmployeeDto(employeeRow);
    employee.salary_history = historyRows.map((h) => ({
      id: h.id,
      previous_salary: h.previous_salary_cents !== null && h.previous_salary_cents !== undefined
        ? h.previous_salary_cents / 100
        : null,
      new_salary: h.new_salary_cents / 100,
      previous_currency: h.previous_currency,
      new_currency: h.new_currency,
      effective_date: h.effective_date,
      actor: h.actor,
      changed_at: h.changed_at,
    }));

    return employee;
  } finally {
    db.close();
  }
}

export function updateSalary(employeeId, payload, dbPath) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("Request body must be a JSON object.");
  }

  const salaryCents = validateSalaryInput(payload.base_salary);

  const rawCurrency = payload.currency;
  if (!rawCurrency || typeof rawCurrency !== "string" || !/^[A-Za-z]{3}$/.test(rawCurrency)) {
    throw new ValidationError("Currency must be a 3-letter ISO currency code.");
  }
  const currency = rawCurrency.toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new ValidationError("Currency must be supported by this workspace.");
  }

  const effectiveDate = validateEffectiveDate(payload.effective_date);

  initializeDatabase(dbPath);
  const db = openDatabase(dbPath);

  try {
    const current = db
      .prepare("SELECT base_salary_cents, currency, salary_effective_date FROM employees WHERE employee_id = ?")
      .get(employeeId);

    if (!current) {
      return null;
    }

    if (effectiveDate <= current.salary_effective_date) {
      throw new ValidationError("Effective date must be later than the current salary date.");
    }

    if (salaryCents === current.base_salary_cents && currency === current.currency) {
      throw new ValidationError("Enter a salary or currency different from the current values.");
    }

    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(`
        UPDATE employees
        SET base_salary_cents = ?, currency = ?, salary_effective_date = ?
        WHERE employee_id = ?
      `).run(salaryCents, currency, effectiveDate, employeeId);

      db.prepare(`
        INSERT INTO salary_history (
          employee_id, previous_salary_cents, new_salary_cents,
          previous_currency, new_currency, effective_date, actor
        ) VALUES (?, ?, ?, ?, ?, ?, 'Local HR Manager')
      `).run(
        employeeId,
        current.base_salary_cents,
        salaryCents,
        current.currency,
        currency,
        effectiveDate
      );

      const oldFormatted = (current.base_salary_cents / 100).toFixed(2);
      const newFormatted = (salaryCents / 100).toFixed(2);
      const details = `Salary updated from ${oldFormatted} ${current.currency} to ${newFormatted} ${currency}, effective ${effectiveDate}.`;

      db.prepare(`
        INSERT INTO audit_events (employee_id, event_type, actor, details)
        VALUES (?, 'salary.updated', 'Local HR Manager', ?)
      `).run(employeeId, details);

      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      if (err.message && err.message.includes("UNIQUE constraint failed: salary_history.employee_id, salary_history.effective_date")) {
        throw new ValidationError("A salary change is already recorded for this effective date.");
      }
      throw err;
    }
  } finally {
    db.close();
  }

  return getEmployee(employeeId, dbPath);
}

function calculatePercentile(sortedCents, p) {
  if (sortedCents.length === 0) return 0;
  if (sortedCents.length === 1) return sortedCents[0] / 100;
  const index = (sortedCents.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  const valCents = sortedCents[lower] * (1 - weight) + sortedCents[upper] * weight;
  return Math.round(valCents) / 100;
}

export function getStats({ dbPath, country = "", department = "" } = {}) {
  const db = openDatabase(dbPath);
  try {
    const totalCountRow = db.prepare("SELECT COUNT(*) AS total FROM employees").get();
    const employeeCount = totalCountRow ? Number(totalCountRow.total) : 0;

    const countries = db.prepare(`
      SELECT country, COUNT(*) AS headcount
      FROM employees
      GROUP BY country
      ORDER BY headcount DESC, country ASC
    `).all().map((r) => ({ country: r.country, headcount: Number(r.headcount) }));

    const departments = db.prepare(`
      SELECT department, COUNT(*) AS headcount
      FROM employees
      GROUP BY department
      ORDER BY headcount DESC, department ASC
    `).all().map((r) => ({ department: r.department, headcount: Number(r.headcount) }));

    const salaryRows = db.prepare(`
      SELECT country, department, job_title, currency, base_salary_cents
      FROM employees
      ORDER BY currency ASC, base_salary_cents ASC
    `).all();

    const currencyMap = new Map();
    const countryMap = new Map();
    const departmentMap = new Map();
    const titleMap = new Map();

    for (const row of salaryRows) {
      const cents = Number(row.base_salary_cents);

      // Currency group
      if (!currencyMap.has(row.currency)) currencyMap.set(row.currency, []);
      currencyMap.get(row.currency).push(cents);

      // Country + Currency group
      const countryKey = `${row.country}|||${row.currency}`;
      if (!countryMap.has(countryKey)) countryMap.set(countryKey, []);
      countryMap.get(countryKey).push(cents);

      // Department + Currency group
      const deptKey = `${row.department}|||${row.currency}`;
      if (!departmentMap.has(deptKey)) departmentMap.set(deptKey, []);
      departmentMap.get(deptKey).push(cents);

      // Department + Title + Currency group
      const titleKey = `${row.department}|||${row.job_title}|||${row.currency}`;
      if (!titleMap.has(titleKey)) titleMap.set(titleKey, []);
      titleMap.get(titleKey).push(cents);
    }

    const currencies = [];
    for (const [curr, salaries] of [...currencyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sum = salaries.reduce((acc, v) => acc + v, 0);
      const avg = Math.round(sum / salaries.length) / 100;
      const min = salaries[0] / 100;
      const max = salaries[salaries.length - 1] / 100;
      const median = calculatePercentile(salaries, 0.5);
      const p25 = calculatePercentile(salaries, 0.25);
      const p75 = calculatePercentile(salaries, 0.75);

      currencies.push({
        currency: curr,
        headcount: salaries.length,
        average_salary: avg,
        median_salary: median,
        p25_salary: p25,
        p75_salary: p75,
        min_salary: min,
        max_salary: max,
        spread_ratio: min > 0 ? Number((max / min).toFixed(2)) : 0,
      });
    }

    function summarizeGroup(map, nameField) {
      const results = [];
      for (const [key, salaries] of map.entries()) {
        const [name, curr] = key.split("|||");
        const sum = salaries.reduce((acc, v) => acc + v, 0);
        results.push({
          [nameField]: name,
          currency: curr,
          headcount: salaries.length,
          average_salary: Math.round(sum / salaries.length) / 100,
          median_salary: calculatePercentile(salaries, 0.5),
          p25_salary: calculatePercentile(salaries, 0.25),
          p75_salary: calculatePercentile(salaries, 0.75),
          min_salary: salaries[0] / 100,
          max_salary: salaries[salaries.length - 1] / 100,
        });
      }
      return results.sort((a, b) => a[nameField].localeCompare(b[nameField]) || a.currency.localeCompare(b.currency));
    }

    const payBandsByTitle = [];
    for (const [key, salaries] of titleMap.entries()) {
      const [dept, title, curr] = key.split("|||");
      const sum = salaries.reduce((acc, v) => acc + v, 0);
      payBandsByTitle.push({
        department: dept,
        job_title: title,
        currency: curr,
        headcount: salaries.length,
        average_salary: Math.round(sum / salaries.length) / 100,
        median_salary: calculatePercentile(salaries, 0.5),
        min_salary: salaries[0] / 100,
        max_salary: salaries[salaries.length - 1] / 100,
      });
    }

    return {
      employee_count: employeeCount,
      country_count: countries.length,
      department_count: departments.length,
      countries,
      departments,
      currencies,
      compensation_by_country: summarizeGroup(countryMap, "country"),
      compensation_by_department: summarizeGroup(departmentMap, "department"),
      pay_bands_by_title: payBandsByTitle.sort(
        (a, b) => a.department.localeCompare(b.department) || a.job_title.localeCompare(b.job_title) || a.currency.localeCompare(b.currency)
      ),
    };
  } finally {
    db.close();
  }
}

export function exportEmployeesCsv({ dbPath, query = "", country = "", department = "", currency = "" } = {}) {
  const clauses = [];
  const params = [];

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    clauses.push(
      "(employee_id LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)"
    );
    const pattern = `%${trimmedQuery}%`;
    params.push(pattern, pattern, pattern, pattern);
  }
  if (country) {
    clauses.push("country = ?");
    params.push(country);
  }
  if (department) {
    clauses.push("department = ?");
    params.push(department);
  }
  if (currency) {
    clauses.push("currency = ?");
    params.push(currency.toUpperCase());
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const db = openDatabase(dbPath);

  try {
    const rows = db.prepare(`
      SELECT employee_id, first_name, last_name, email, country, department,
             job_title, hire_date, base_salary_cents, currency, salary_effective_date
      FROM employees${whereClause}
      ORDER BY employee_id ASC
    `).all(...params);

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      "Employee ID",
      "First Name",
      "Last Name",
      "Email",
      "Country",
      "Department",
      "Job Title",
      "Hire Date",
      "Base Salary",
      "Currency",
      "Salary Effective Date",
    ];

    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        escapeCsv(r.employee_id),
        escapeCsv(r.first_name),
        escapeCsv(r.last_name),
        escapeCsv(r.email),
        escapeCsv(r.country),
        escapeCsv(r.department),
        escapeCsv(r.job_title),
        escapeCsv(r.hire_date),
        (Number(r.base_salary_cents) / 100).toFixed(2),
        escapeCsv(r.currency),
        escapeCsv(r.salary_effective_date),
      ].join(","));
    }

    return lines.join("\r\n");
  } finally {
    db.close();
  }
}


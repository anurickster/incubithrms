import { initializeDatabase, openDatabase } from "./database.js";

export const SEED = 20261105;
export const EMPLOYEE_COUNT = 10_000;

export const FIRST_NAMES = [
  "Aarav", "Aisha", "Amara", "Anaya", "Arjun", "Chloe", "Daniel", "Ethan",
  "Fatima", "Hana", "Isabella", "Jamal", "Kai", "Leila", "Liam", "Maya",
  "Noah", "Olivia", "Priya", "Ravi", "Sofia", "Theo", "Yuki", "Zara",
];

export const LAST_NAMES = [
  "Anderson", "Bennett", "Chen", "Clark", "Diaz", "Gupta", "Hassan",
  "Ivanov", "Johnson", "Khan", "Kim", "Martin", "Miller", "Nakamura",
  "Patel", "Reed", "Singh", "Smith", "Taylor", "Williams",
];

export const COUNTRIES = [
  { country: "United States", currency: "USD" },
  { country: "United Kingdom", currency: "GBP" },
  { country: "India", currency: "INR" },
  { country: "Germany", currency: "EUR" },
  { country: "France", currency: "EUR" },
  { country: "Canada", currency: "CAD" },
  { country: "Australia", currency: "AUD" },
  { country: "Japan", currency: "JPY" },
  { country: "Singapore", currency: "SGD" },
  { country: "Mexico", currency: "MXN" },
];

export const DEPARTMENTS = [
  "Engineering", "Product", "Design", "People", "Finance", "Sales",
  "Marketing", "Operations", "Legal", "Customer Success",
];

export const TITLES = {
  Engineering: ["Software Engineer", "Engineering Manager", "Staff Engineer"],
  Product: ["Product Manager", "Product Analyst", "Product Director"],
  Design: ["Product Designer", "UX Researcher", "Design Lead"],
  People: ["HR Business Partner", "Talent Partner", "People Manager"],
  Finance: ["Financial Analyst", "Controller", "Finance Manager"],
  Sales: ["Account Executive", "Sales Manager", "Sales Director"],
  Marketing: ["Marketing Manager", "Content Strategist", "Growth Analyst"],
  Operations: ["Operations Analyst", "Program Manager", "Operations Lead"],
  Legal: ["Legal Counsel", "Compliance Analyst", "Legal Operations Manager"],
  "Customer Success": ["Customer Success Manager", "Support Specialist", "Implementation Lead"],
};

export function createPrng(seed = SEED) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildEmployees(count = EMPLOYEE_COUNT, seed = SEED) {
  const rand = createPrng(seed);
  const baseTimestamp = Date.UTC(2026, 10, 5); // 2026-11-05
  const oneDayMs = 24 * 60 * 60 * 1000;
  const employees = [];

  for (let number = 1; number <= count; number++) {
    const loc = COUNTRIES[(number - 1) % COUNTRIES.length];
    const country = loc.country;
    const currency = loc.currency;
    const first = FIRST_NAMES[(number * 7) % FIRST_NAMES.length];
    const last = LAST_NAMES[(number * 13 + Math.floor(number / 25)) % LAST_NAMES.length];
    const department = DEPARTMENTS[(number * 3 + Math.floor(number / 17)) % DEPARTMENTS.length];
    const titleOptions = TITLES[department];
    const title = titleOptions[Math.floor(rand() * titleOptions.length)];

    // Base salary in cents (42,000 to 168,000 units)
    let salaryCents = Math.round((42000 + rand() * (168000 - 42000)) * 100);
    if (currency === "INR") {
      salaryCents *= 82;
    } else if (currency === "JPY") {
      salaryCents *= 149;
    } else if (["GBP", "EUR", "CAD", "AUD", "SGD"].includes(currency)) {
      salaryCents = Math.round(salaryCents * 0.9);
    } else if (currency === "MXN") {
      salaryCents *= 17;
    }

    const daysAgo = 60 + Math.floor(rand() * (3650 - 60));
    const hireDateObj = new Date(baseTimestamp - daysAgo * oneDayMs);
    const hireDate = hireDateObj.toISOString().slice(0, 10);
    const employeeId = `ACME-${String(number).padStart(5, "0")}`;
    const email = `employee${String(number).padStart(5, "0")}@acme.example`;

    employees.push({
      employee_id: employeeId,
      first_name: first,
      last_name: last,
      email,
      country,
      department,
      job_title: title,
      hire_date: hireDate,
      base_salary_cents: salaryCents,
      currency,
      salary_effective_date: hireDate,
    });
  }

  return employees;
}

export function seedDatabase(customPath) {
  const db = initializeDatabase(customPath);
  try {
    const employees = buildEmployees();

    db.exec("BEGIN IMMEDIATE;");
    const insertEmployee = db.prepare(`
      INSERT OR IGNORE INTO employees (
        employee_id, first_name, last_name, email, country, department,
        job_title, hire_date, base_salary_cents, currency, salary_effective_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertHistory = db.prepare(`
      INSERT OR IGNORE INTO salary_history (
        employee_id, previous_salary_cents, new_salary_cents,
        previous_currency, new_currency, effective_date, actor
      ) VALUES (?, NULL, ?, NULL, ?, ?, 'System seed')
    `);

    let insertedEmployees = 0;
    for (const emp of employees) {
      const res = insertEmployee.run(
        emp.employee_id,
        emp.first_name,
        emp.last_name,
        emp.email,
        emp.country,
        emp.department,
        emp.job_title,
        emp.hire_date,
        emp.base_salary_cents,
        emp.currency,
        emp.salary_effective_date
      );
      if (res.changes > 0) {
        insertedEmployees += res.changes;
        insertHistory.run(
          emp.employee_id,
          emp.base_salary_cents,
          emp.currency,
          emp.salary_effective_date
        );
      }
    }
    db.exec("COMMIT;");
    return insertedEmployees;
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {}
    throw err;
  } finally {
    db.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed.js")) {
  const start = performance.now();
  const count = seedDatabase();
  const duration = (performance.now() - start).toFixed(2);
  console.log(`Seed complete. Inserted: ${count} employees in ${duration}ms. Dataset: 10,000 deterministic employees.`);
}


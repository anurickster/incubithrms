import random
from datetime import date, timedelta

from .database import connect, initialize


SEED = 20261105
EMPLOYEE_COUNT = 10_000
FIRST_NAMES = (
    "Aarav", "Aisha", "Amara", "Anaya", "Arjun", "Chloe", "Daniel", "Ethan",
    "Fatima", "Hana", "Isabella", "Jamal", "Kai", "Leila", "Liam", "Maya",
    "Noah", "Olivia", "Priya", "Ravi", "Sofia", "Theo", "Yuki", "Zara",
)
LAST_NAMES = (
    "Anderson", "Bennett", "Chen", "Clark", "Diaz", "Gupta", "Hassan",
    "Ivanov", "Johnson", "Khan", "Kim", "Martin", "Miller", "Nakamura",
    "Patel", "Reed", "Singh", "Smith", "Taylor", "Williams",
)
COUNTRIES = (
    ("United States", "USD"),
    ("United Kingdom", "GBP"),
    ("India", "INR"),
    ("Germany", "EUR"),
    ("France", "EUR"),
    ("Canada", "CAD"),
    ("Australia", "AUD"),
    ("Japan", "JPY"),
    ("Singapore", "SGD"),
    ("Mexico", "MXN"),
)
DEPARTMENTS = (
    "Engineering", "Product", "Design", "People", "Finance", "Sales",
    "Marketing", "Operations", "Legal", "Customer Success",
)
TITLES = {
    "Engineering": ("Software Engineer", "Engineering Manager", "Staff Engineer"),
    "Product": ("Product Manager", "Product Analyst", "Product Director"),
    "Design": ("Product Designer", "UX Researcher", "Design Lead"),
    "People": ("HR Business Partner", "Talent Partner", "People Manager"),
    "Finance": ("Financial Analyst", "Controller", "Finance Manager"),
    "Sales": ("Account Executive", "Sales Manager", "Sales Director"),
    "Marketing": ("Marketing Manager", "Content Strategist", "Growth Analyst"),
    "Operations": ("Operations Analyst", "Program Manager", "Operations Lead"),
    "Legal": ("Legal Counsel", "Compliance Analyst", "Legal Operations Manager"),
    "Customer Success": ("Customer Success Manager", "Support Specialist", "Implementation Lead"),
}


def build_employees() -> list[tuple]:
    randomizer = random.Random(SEED)
    today = date(2026, 11, 5)
    rows = []
    for number in range(1, EMPLOYEE_COUNT + 1):
        country, currency = COUNTRIES[(number - 1) % len(COUNTRIES)]
        first = FIRST_NAMES[(number * 7) % len(FIRST_NAMES)]
        last = LAST_NAMES[(number * 13 + number // 25) % len(LAST_NAMES)]
        department = DEPARTMENTS[(number * 3 + number // 17) % len(DEPARTMENTS)]
        title = randomizer.choice(TITLES[department])
        salary = round(randomizer.uniform(42_000, 168_000) * 100)
        if currency == "INR":
            salary *= 82
        elif currency == "JPY":
            salary *= 149
        elif currency in ("GBP", "EUR", "CAD", "AUD", "SGD"):
            salary = round(salary * 0.9)
        elif currency == "MXN":
            salary *= 17
        hire_date = today - timedelta(days=randomizer.randint(60, 3650))
        rows.append(
            (
                f"ACME-{number:05d}",
                first,
                last,
                f"employee{number:05d}@acme.example",
                country,
                department,
                title,
                hire_date.isoformat(),
                salary,
                currency,
                hire_date.isoformat(),
            )
        )
    return rows


def seed_database(path=None) -> int:
    initialize(path)
    employees = build_employees()
    with connect(path) as connection:
        before = connection.total_changes
        connection.executemany(
            """
            INSERT OR IGNORE INTO employees
                (employee_id, first_name, last_name, email, country, department,
                 job_title, hire_date, base_salary_cents, currency, salary_effective_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            employees,
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO salary_history
                (employee_id, previous_salary_cents, new_salary_cents, previous_currency,
                 new_currency, effective_date, actor)
            VALUES (?, NULL, ?, NULL, ?, ?, 'System seed')
            """,
            [(row[0], row[8], row[9], row[10]) for row in employees],
        )
        return connection.total_changes - before


if __name__ == "__main__":
    seed_database()
    print("Seed complete. Dataset: 10,000 deterministic employees.")

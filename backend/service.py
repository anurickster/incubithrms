from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
import sqlite3

from .database import connect, initialize


class ValidationError(ValueError):
    pass


SORT_COLUMNS = {
    "employee_id": "employee_id",
    "name": "last_name COLLATE NOCASE",
    "country": "country COLLATE NOCASE",
    "department": "department COLLATE NOCASE",
    "base_salary": "base_salary_cents",
    "currency": "currency",
}
SUPPORTED_CURRENCIES = {"AUD", "CAD", "EUR", "GBP", "INR", "JPY", "MXN", "SGD", "USD"}


def _row_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _employee_dict(row: sqlite3.Row) -> dict:
    employee = _row_dict(row)
    employee["base_salary"] = employee.pop("base_salary_cents") / 100
    return employee


def list_employees(
    path=None,
    query: str = "",
    country: str = "",
    department: str = "",
    currency: str = "",
    sort: str = "employee_id",
    direction: str = "asc",
    page: int = 1,
    page_size: int = 25,
) -> dict:
    if page < 1:
        raise ValidationError("Page must be at least 1.")
    if not 1 <= page_size <= 100:
        raise ValidationError("Page size must be between 1 and 100.")
    if sort not in SORT_COLUMNS:
        raise ValidationError("Unsupported sort field.")
    if direction not in ("asc", "desc"):
        raise ValidationError("Sort direction must be asc or desc.")

    clauses = []
    values = []
    if query.strip():
        clauses.append(
            "(employee_id LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)"
        )
        pattern = f"%{query.strip()}%"
        values.extend((pattern,) * 4)
    for column, value in (
        ("country", country),
        ("department", department),
        ("currency", currency),
    ):
        if value:
            clauses.append(f"{column} = ?")
            values.append(value)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    order = SORT_COLUMNS[sort]
    if sort == "name":
        order += ", first_name COLLATE NOCASE"
    with connect(path) as connection:
        total = connection.execute(
            f"SELECT COUNT(*) FROM employees{where}", values
        ).fetchone()[0]
        rows = connection.execute(
            f"""
            SELECT employee_id, first_name, last_name, email, country, department,
                   job_title, hire_date, base_salary_cents, currency, salary_effective_date
            FROM employees{where}
            ORDER BY {order} {direction.upper()}, employee_id ASC
            LIMIT ? OFFSET ?
            """,
            [*values, page_size, (page - 1) * page_size],
        ).fetchall()
    return {
        "employees": [_employee_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


def get_employee(employee_id: str, path=None) -> dict | None:
    with connect(path) as connection:
        employee = connection.execute(
            "SELECT * FROM employees WHERE employee_id = ?", (employee_id,)
        ).fetchone()
        if employee is None:
            return None
        history = connection.execute(
            """
            SELECT id, previous_salary_cents, new_salary_cents, previous_currency, new_currency,
                   effective_date, actor, changed_at
            FROM salary_history
            WHERE employee_id = ?
            ORDER BY effective_date DESC, id DESC
            """,
            (employee_id,),
        ).fetchall()
    result = _employee_dict(employee)
    result["salary_history"] = []
    for row in history:
        entry = _row_dict(row)
        previous_cents = entry.pop("previous_salary_cents")
        entry["previous_salary"] = previous_cents / 100 if previous_cents is not None else None
        entry["new_salary"] = entry.pop("new_salary_cents") / 100
        result["salary_history"].append(entry)
    return result


def _validated_salary(value) -> int:
    if isinstance(value, bool):
        raise ValidationError("Salary must be a positive number.")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValidationError("Salary must be a positive number.") from None
    if not amount.is_finite() or amount <= 0 or amount > Decimal("1000000000"):
        raise ValidationError("Salary must be greater than 0 and no more than 1,000,000,000.")
    quantized = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if quantized != amount:
        raise ValidationError("Salary must have no more than 2 decimal places.")
    return int(quantized * 100)


def update_salary(employee_id: str, payload: dict, path=None) -> dict | None:
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")
    salary = _validated_salary(payload.get("base_salary"))
    currency = payload.get("currency")
    if not isinstance(currency, str) or not re.fullmatch(r"[A-Za-z]{3}", currency):
        raise ValidationError("Currency must be a 3-letter ISO currency code.")
    currency = currency.upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise ValidationError("Currency must be supported by this workspace.")
    effective_date = payload.get("effective_date")
    if not isinstance(effective_date, str):
        raise ValidationError("Effective date is required in YYYY-MM-DD format.")
    try:
        parsed_date = date.fromisoformat(effective_date)
    except ValueError:
        raise ValidationError("Effective date must be a valid YYYY-MM-DD date.") from None
    if parsed_date.isoformat() != effective_date:
        raise ValidationError("Effective date must be a valid YYYY-MM-DD date.")
    if parsed_date > date.today():
        raise ValidationError("Future salary changes are not supported.")

    initialize(path)
    with connect(path) as connection:
        employee = connection.execute(
            "SELECT base_salary_cents, currency, salary_effective_date "
            "FROM employees WHERE employee_id = ?",
            (employee_id,),
        ).fetchone()
        if employee is None:
            return None
        if parsed_date.isoformat() <= employee["salary_effective_date"]:
            raise ValidationError("Effective date must be later than the current salary date.")
        if salary == employee["base_salary_cents"] and currency == employee["currency"]:
            raise ValidationError("Enter a salary or currency different from the current values.")
        try:
            connection.execute(
                """
                UPDATE employees
                SET base_salary_cents = ?, currency = ?, salary_effective_date = ?
                WHERE employee_id = ?
                """,
                (salary, currency, effective_date, employee_id),
            )
            connection.execute(
                """
                INSERT INTO salary_history
                    (employee_id, previous_salary_cents, new_salary_cents, previous_currency,
                     new_currency, effective_date, actor)
                VALUES (?, ?, ?, ?, ?, ?, 'Local HR Manager')
                """,
                (
                    employee_id,
                    employee["base_salary_cents"],
                    salary,
                    employee["currency"],
                    currency,
                    effective_date,
                ),
            )
            connection.execute(
                """
                INSERT INTO audit_events (employee_id, event_type, actor, details)
                VALUES (?, 'salary.updated', 'Local HR Manager', ?)
                """,
                (
                    employee_id,
                    f"Salary updated from {employee['base_salary_cents'] / 100:.2f} "
                    f"{employee['currency']} to {salary / 100:.2f} {currency}, "
                    f"effective {effective_date}.",
                ),
            )
        except sqlite3.IntegrityError as error:
            if "salary_history.employee_id, salary_history.effective_date" in str(error):
                raise ValidationError("A salary change is already recorded for this effective date.") from None
            raise
    return get_employee(employee_id, path)


def get_stats(path=None) -> dict:
    with connect(path) as connection:
        count = connection.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
        countries = connection.execute(
            "SELECT country, COUNT(*) AS headcount FROM employees "
            "GROUP BY country ORDER BY headcount DESC, country"
        ).fetchall()
        departments = connection.execute(
            "SELECT department, COUNT(*) AS headcount FROM employees "
            "GROUP BY department ORDER BY headcount DESC, department"
        ).fetchall()
        salary_rows = connection.execute(
            "SELECT country, department, currency, base_salary_cents "
            "FROM employees ORDER BY currency, base_salary_cents"
        ).fetchall()

    groups: dict[str, list[float]] = {}
    country_groups: dict[tuple[str, str], list[int]] = {}
    department_groups: dict[tuple[str, str], list[int]] = {}
    for row in salary_rows:
        groups.setdefault(row["currency"], []).append(row["base_salary_cents"])
        country_groups.setdefault((row["country"], row["currency"]), []).append(
            row["base_salary_cents"]
        )
        department_groups.setdefault((row["department"], row["currency"]), []).append(
            row["base_salary_cents"]
        )

    def summary(group_key: str, grouped_salaries: dict[tuple[str, str], list[int]]) -> list[dict]:
        summaries = []
        for (group_name, currency), salaries in sorted(grouped_salaries.items()):
            middle = len(salaries) // 2
            median_cents = (
                Decimal(salaries[middle])
                if len(salaries) % 2
                else (Decimal(salaries[middle - 1]) + Decimal(salaries[middle])) / 2
            )
            median_cents = median_cents.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            average_cents = (
                Decimal(sum(salaries)) / len(salaries)
            ).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            summaries.append(
                {
                    group_key: group_name,
                    "currency": currency,
                    "headcount": len(salaries),
                    "average_salary": float(average_cents / 100),
                    "median_salary": float(median_cents / 100),
                }
            )
        return summaries

    currencies = []
    for currency, salaries in sorted(groups.items()):
        middle = len(salaries) // 2
        median_cents = (
            Decimal(salaries[middle])
            if len(salaries) % 2
            else (Decimal(salaries[middle - 1]) + Decimal(salaries[middle])) / 2
        )
        median_cents = median_cents.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        average_cents = (Decimal(sum(salaries)) / len(salaries)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
        currencies.append(
            {
                "currency": currency,
                "headcount": len(salaries),
                "average_salary": float(average_cents / 100),
                "median_salary": float(median_cents / 100),
                "min_salary": salaries[0] / 100,
                "max_salary": salaries[-1] / 100,
            }
        )
    return {
        "employee_count": count,
        "country_count": len(countries),
        "department_count": len(departments),
        "countries": [_row_dict(row) for row in countries],
        "departments": [_row_dict(row) for row in departments],
        "currencies": currencies,
        "compensation_by_country": summary("country", country_groups),
        "compensation_by_department": summary("department", department_groups),
    }

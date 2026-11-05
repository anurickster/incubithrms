import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from .database import connect, initialize
from .seed import build_employees, seed_database
from .service import (
    ValidationError,
    get_employee,
    get_stats,
    list_employees,
    update_salary,
)


class SalaryServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.sqlite3"
        initialize(self.db_path)
        employees = build_employees()[:40]
        with connect(self.db_path) as connection:
            connection.executemany(
                """
                INSERT INTO employees
                    (employee_id, first_name, last_name, email, country, department,
                     job_title, hire_date, base_salary_cents, currency, salary_effective_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                employees,
            )
            connection.executemany(
                """
                INSERT INTO salary_history
                    (employee_id, new_salary_cents, new_currency, effective_date, actor)
                VALUES (?, ?, ?, ?, 'System seed')
                """,
                [(row[0], row[8], row[9], row[10]) for row in employees],
            )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_seed_data_is_deterministic_and_has_unique_ids(self):
        rows = build_employees()
        self.assertEqual(len(rows), 10_000)
        self.assertEqual(rows, build_employees())
        self.assertEqual(len({row[0] for row in rows}), 10_000)

    def test_seed_is_idempotent_and_creates_initial_salary_history(self):
        self.assertEqual(seed_database(self.db_path), 19_920)
        self.assertEqual(seed_database(self.db_path), 0)
        with connect(self.db_path) as connection:
            employee_count = connection.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
            history_count = connection.execute("SELECT COUNT(*) FROM salary_history").fetchone()[0]
        self.assertEqual(employee_count, 10_000)
        self.assertEqual(history_count, 10_000)

    def test_search_filter_and_pagination_are_combined(self):
        result = list_employees(
            self.db_path, query="ACME-00", country="United States", page=1, page_size=3
        )
        self.assertEqual(len(result["employees"]), 3)
        self.assertEqual(result["total"], 4)
        self.assertEqual(result["pages"], 2)
        self.assertTrue(all(row["country"] == "United States" for row in result["employees"]))

    def test_sort_is_validated_and_salary_order_is_numeric(self):
        result = list_employees(self.db_path, sort="base_salary", direction="desc", page_size=5)
        salaries = [employee["base_salary"] for employee in result["employees"]]
        self.assertEqual(salaries, sorted(salaries, reverse=True))
        with self.assertRaises(ValidationError):
            list_employees(self.db_path, sort="email; DROP TABLE employees")

    def test_pagination_limits_are_validated(self):
        with self.assertRaises(ValidationError):
            list_employees(self.db_path, page=0)
        with self.assertRaises(ValidationError):
            list_employees(self.db_path, page_size=101)

    def test_salary_change_is_effective_dated_and_audited(self):
        employee_id = "ACME-00001"
        employee = get_employee(employee_id, self.db_path)
        effective = (date.fromisoformat(employee["salary_effective_date"]) + timedelta(days=1)).isoformat()
        updated = update_salary(
            employee_id,
            {"base_salary": 123456.78, "currency": "usd", "effective_date": effective},
            self.db_path,
        )
        self.assertEqual(updated["base_salary"], 123456.78)
        self.assertEqual(updated["currency"], "USD")
        self.assertEqual(len(updated["salary_history"]), 2)
        self.assertEqual(updated["salary_history"][0]["actor"], "Local HR Manager")
        with connect(self.db_path) as connection:
            audit = connection.execute(
                "SELECT event_type FROM audit_events WHERE employee_id = ?", (employee_id,)
            ).fetchone()
        self.assertEqual(audit["event_type"], "salary.updated")

    def test_salary_validation_rejects_bad_values_and_backdating(self):
        employee = get_employee("ACME-00001", self.db_path)
        later = (date.fromisoformat(employee["salary_effective_date"]) + timedelta(days=1)).isoformat()
        invalid_payloads = (
            {"base_salary": -1, "currency": "USD", "effective_date": later},
            {"base_salary": True, "currency": "USD", "effective_date": later},
            {"base_salary": "NaN", "currency": "USD", "effective_date": later},
            {"base_salary": 100.123, "currency": "USD", "effective_date": later},
            {"base_salary": 100, "currency": "US", "effective_date": later},
            {"base_salary": 100, "currency": "ZZZ", "effective_date": later},
            {"base_salary": 100, "currency": "USD", "effective_date": "2026-02-30"},
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                update_salary("ACME-00001", payload, self.db_path)
        with self.assertRaises(ValidationError):
            update_salary(
                "ACME-00001",
                {
                    "base_salary": 123456,
                    "currency": "USD",
                    "effective_date": employee["salary_effective_date"],
                },
                self.db_path,
            )

    def test_same_day_duplicate_change_fails_without_partial_update(self):
        employee_id = "ACME-00001"
        employee = get_employee(employee_id, self.db_path)
        effective = (date.fromisoformat(employee["salary_effective_date"]) + timedelta(days=1)).isoformat()
        payload = {"base_salary": 120000, "currency": "USD", "effective_date": effective}
        update_salary(employee_id, payload, self.db_path)
        with self.assertRaises(ValidationError):
            update_salary(
                employee_id,
                {"base_salary": 125000, "currency": "USD", "effective_date": effective},
                self.db_path,
            )
        self.assertEqual(get_employee(employee_id, self.db_path)["base_salary"], 120000)

    def test_currency_stats_never_mix_units(self):
        result = get_stats(self.db_path)
        self.assertEqual(result["employee_count"], 40)
        self.assertEqual(sum(row["headcount"] for row in result["currencies"]), 40)
        self.assertEqual(
            sum(row["headcount"] for row in result["compensation_by_country"]), 40
        )
        self.assertEqual(
            sum(row["headcount"] for row in result["compensation_by_department"]), 40
        )
        for group in result["currencies"]:
            salaries = [
                employee["base_salary"]
                for employee in list_employees(self.db_path, currency=group["currency"], page_size=100)["employees"]
            ]
            self.assertEqual(group["headcount"], len(salaries))
            self.assertGreater(group["average_salary"], 0)


if __name__ == "__main__":
    unittest.main()

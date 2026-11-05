import json
import os
import tempfile
import threading
import unittest
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .database import connect, initialize
from .server import SalaryHandler


class QuietSalaryHandler(SalaryHandler):
    def log_message(self, format, *args):
        pass


class SalaryApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "api.sqlite3"
        self.original_db_path = os.environ.get("SALARY_DB_PATH")
        os.environ["SALARY_DB_PATH"] = str(self.db_path)
        initialize(self.db_path)
        with connect(self.db_path) as connection:
            connection.execute(
                """
                INSERT INTO employees
                    (employee_id, first_name, last_name, email, country, department,
                     job_title, hire_date, base_salary_cents, currency, salary_effective_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "ACME-TEST01", "Aisha", "Khan", "aisha@acme.example",
                    "India", "Engineering", "Software Engineer", "2020-01-02",
                    5_000_000, "INR", "2020-01-02",
                ),
            )
            connection.execute(
                """
                INSERT INTO salary_history
                    (employee_id, new_salary_cents, new_currency, effective_date, actor)
                VALUES ('ACME-TEST01', 5000000, 'INR', '2020-01-02', 'System seed')
                """
            )
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietSalaryHandler)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=2)
        if self.original_db_path is None:
            os.environ.pop("SALARY_DB_PATH", None)
        else:
            os.environ["SALARY_DB_PATH"] = self.original_db_path
        self.temp_dir.cleanup()

    def call_api(self, path, method="GET", payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        request = Request(
            self.base_url + path,
            data=body,
            headers={"Content-Type": "application/json"},
            method=method,
        )
        try:
            with urlopen(request, timeout=3) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            try:
                return error.code, json.loads(error.read())
            finally:
                error.close()

    def test_list_search_and_stats_endpoints(self):
        status, result = self.call_api("/api/employees?q=Aisha&page=1&page_size=5")
        self.assertEqual(status, 200)
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["employees"][0]["base_salary"], 50_000)
        status, stats = self.call_api("/api/stats")
        self.assertEqual(status, 200)
        self.assertEqual(stats["employee_count"], 1)
        self.assertEqual(stats["compensation_by_department"][0]["currency"], "INR")

    def test_patch_salary_updates_current_value_and_history(self):
        effective = date.today().isoformat()
        status, employee = self.call_api(
            "/api/employees/ACME-TEST01",
            "PATCH",
            {"base_salary": "65000.25", "currency": "inr", "effective_date": effective},
        )
        self.assertEqual(status, 200)
        self.assertEqual(employee["base_salary"], 65_000.25)
        self.assertEqual(employee["salary_history"][0]["effective_date"], effective)
        self.assertEqual(employee["salary_history"][0]["previous_salary"], 50_000)

    def test_future_salary_change_is_rejected_without_changing_current_salary(self):
        future = (date.today() + timedelta(days=1)).isoformat()
        status, result = self.call_api(
            "/api/employees/ACME-TEST01",
            "PATCH",
            {"base_salary": "65000.25", "currency": "INR", "effective_date": future},
        )
        self.assertEqual(status, 400)
        self.assertIn("Future", result["error"])
        _, employee = self.call_api("/api/employees/ACME-TEST01")
        self.assertEqual(employee["base_salary"], 50_000)
        self.assertEqual(len(employee["salary_history"]), 1)

    def test_invalid_salary_and_missing_employee_return_clear_errors(self):
        status, result = self.call_api(
            "/api/employees/ACME-TEST01",
            "PATCH",
            {"base_salary": -1, "currency": "USD", "effective_date": "2026-01-01"},
        )
        self.assertEqual(status, 400)
        self.assertIn("Salary", result["error"])
        status, result = self.call_api("/api/employees/NO-SUCH-EMPLOYEE")
        self.assertEqual(status, 404)
        self.assertEqual(result["error"], "Employee not found.")


if __name__ == "__main__":
    unittest.main()

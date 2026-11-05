import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .database import ROOT, database_path, initialize
from .seed import seed_database
from .service import ValidationError, get_employee, get_stats, list_employees, update_salary


DIST_DIR = ROOT / "frontend" / "dist"
MAX_BODY_SIZE = 16_384


class SalaryHandler(BaseHTTPRequestHandler):
    server_version = "Compwise/1.0"

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValidationError("Invalid Content-Length header.") from None
        if length < 1 or length > MAX_BODY_SIZE:
            raise ValidationError("Request body must be between 1 and 16,384 bytes.")
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValidationError("Request body must contain valid JSON.") from None
        if not isinstance(payload, dict):
            raise ValidationError("Request body must be a JSON object.")
        return payload

    @staticmethod
    def _single(query: dict, name: str, default: str = "") -> str:
        values = query.get(name, [default])
        if len(values) != 1:
            raise ValidationError(f"Only one {name} value is allowed.")
        return values[0]

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/health":
                self._send_json(200, {"status": "ok"})
            elif parsed.path == "/api/stats":
                self._send_json(200, get_stats(database_path()))
            elif parsed.path == "/api/employees":
                query = parse_qs(parsed.query, keep_blank_values=False)
                try:
                    page = int(self._single(query, "page", "1"))
                    page_size = int(self._single(query, "page_size", "25"))
                except ValueError:
                    raise ValidationError("Page and page size must be integers.") from None
                payload = list_employees(
                    database_path(),
                    query=self._single(query, "q"),
                    country=self._single(query, "country"),
                    department=self._single(query, "department"),
                    currency=self._single(query, "currency"),
                    sort=self._single(query, "sort", "employee_id"),
                    direction=self._single(query, "direction", "asc"),
                    page=page,
                    page_size=page_size,
                )
                self._send_json(200, payload)
            elif parsed.path.startswith("/api/employees/"):
                employee_id = unquote(parsed.path.removeprefix("/api/employees/"))
                employee = get_employee(employee_id, database_path())
                if employee is None:
                    self._send_json(404, {"error": "Employee not found."})
                else:
                    self._send_json(200, employee)
            else:
                self._serve_static(parsed.path)
        except ValidationError as error:
            self._send_json(400, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/employees/"):
            self._send_json(404, {"error": "Endpoint not found."})
            return
        employee_id = unquote(parsed.path.removeprefix("/api/employees/"))
        try:
            employee = update_salary(employee_id, self._read_json(), database_path())
            if employee is None:
                self._send_json(404, {"error": "Employee not found."})
            else:
                self._send_json(200, employee)
        except ValidationError as error:
            self._send_json(400, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _serve_static(self, request_path: str) -> None:
        if not DIST_DIR.is_dir():
            self._send_json(404, {"error": "UI build not found. Start the Vite dev server or run npm run build."})
            return
        candidate = (DIST_DIR / request_path.lstrip("/")).resolve()
        if DIST_DIR.resolve() not in candidate.parents and candidate != DIST_DIR.resolve():
            self._send_json(404, {"error": "Not found."})
            return
        if not candidate.is_file():
            candidate = DIST_DIR / "index.html"
        if not candidate.is_file():
            self._send_json(404, {"error": "Not found."})
            return
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        super().log_message(format, *args)


def main() -> None:
    initialize()
    seed_database()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), SalaryHandler)
    print(f"API ready at http://127.0.0.1:8000 (database: {database_path()})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

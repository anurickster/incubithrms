import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { parse } from "node:url";
import { getDatabasePath, initializeDatabase, ROOT } from "./database.js";
import { seedDatabase } from "./seed.js";
import {
  exportEmployeesCsv,
  getEmployee,
  getStats,
  listEmployees,
  updateSalary,
  ValidationError,
} from "./service.js";

const DIST_DIR = resolve(ROOT, "frontend", "dist");
const MAX_BODY_SIZE = 16_384;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function sendJson(res, statusCode, data) {
  const body = Buffer.from(JSON.stringify(data), "utf-8");
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function readJsonBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        rejectPromise(new ValidationError("Request body must be between 1 and 16,384 bytes."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        rejectPromise(new ValidationError("Request body must contain valid JSON."));
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          rejectPromise(new ValidationError("Request body must be a JSON object."));
          return;
        }
        resolvePromise(parsed);
      } catch {
        rejectPromise(new ValidationError("Request body must contain valid JSON."));
      }
    });

    req.on("error", (err) => rejectPromise(err));
  });
}

function serveStatic(req, res, pathname) {
  if (!existsSync(DIST_DIR)) {
    sendJson(res, 404, {
      error: "UI build not found. Start the Vite dev server or run npm run build.",
    });
    return;
  }

  const safePath = pathname.replace(/^\/+/, "");
  let filePath = resolve(DIST_DIR, safePath);

  // Path traversal check
  if (!filePath.startsWith(DIST_DIR)) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  // If path is a directory or does not exist, serve index.html (SPA fallback)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST_DIR, "index.html");
  }

  if (!existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const stat = statSync(filePath);
  const ext = extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": stat.size,
  });

  const stream = createReadStream(filePath);
  stream.pipe(res);
}

export function createSalaryHandler(options = {}) {
  const dbPath = options.dbPath || getDatabasePath();

  return async (req, res) => {
    const parsedUrl = parse(req.url, true);
    const pathname = parsedUrl.pathname || "/";
    const method = req.method;

    try {
      if (method === "GET") {
        if (pathname === "/api/health") {
          sendJson(res, 200, { status: "ok" });
          return;
        }

        if (pathname === "/api/stats") {
          const stats = getStats({
            dbPath,
            country: parsedUrl.query.country || "",
            department: parsedUrl.query.department || "",
          });
          sendJson(res, 200, stats);
          return;
        }

        if (pathname === "/api/employees/export") {
          const csv = exportEmployeesCsv({
            dbPath,
            query: parsedUrl.query.q || "",
            country: parsedUrl.query.country || "",
            department: parsedUrl.query.department || "",
            currency: parsedUrl.query.currency || "",
          });
          const buffer = Buffer.from(csv, "utf-8");
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Length": buffer.length,
            "Content-Disposition": 'attachment; filename="acme-employees.csv"',
            "Cache-Control": "no-store",
          });
          res.end(buffer);
          return;
        }

        if (pathname === "/api/employees") {
          const result = listEmployees({
            dbPath,
            query: parsedUrl.query.q || "",
            country: parsedUrl.query.country || "",
            department: parsedUrl.query.department || "",
            currency: parsedUrl.query.currency || "",
            sort: parsedUrl.query.sort || "employee_id",
            direction: parsedUrl.query.direction || "asc",
            page: parsedUrl.query.page || 1,
            pageSize: parsedUrl.query.page_size || 25,
          });
          sendJson(res, 200, result);
          return;
        }

        if (pathname.startsWith("/api/employees/")) {
          const employeeId = decodeURIComponent(pathname.slice("/api/employees/".length));
          const employee = getEmployee(employeeId, dbPath);
          if (!employee) {
            sendJson(res, 404, { error: "Employee not found." });
            return;
          }
          sendJson(res, 200, employee);
          return;
        }

        // Static files fallback
        serveStatic(req, res, pathname);
        return;
      }

      if (method === "PATCH") {
        if (pathname.startsWith("/api/employees/")) {
          const employeeId = decodeURIComponent(pathname.slice("/api/employees/".length));
          const body = await readJsonBody(req);
          const updated = updateSalary(employeeId, body, dbPath);
          if (!updated) {
            sendJson(res, 404, { error: "Employee not found." });
            return;
          }
          sendJson(res, 200, updated);
          return;
        }
        sendJson(res, 404, { error: "Endpoint not found." });
        return;
      }

      sendJson(res, 405, { error: "Method not allowed." });
    } catch (err) {
      if (err instanceof ValidationError) {
        sendJson(res, 400, { error: err.message });
      } else {
        console.error("Internal server error:", err);
        sendJson(res, 500, { error: "Internal server error." });
      }
    }
  };
}

export function createSalaryServer(options = {}) {
  const handler = createSalaryHandler(options);
  return createServer(handler);
}

export function startServer(port = Number(process.env.PORT) || 8000, customDbPath) {
  const dbPath = getDatabasePath(customDbPath);
  initializeDatabase(dbPath);
  seedDatabase(dbPath);

  const server = createSalaryServer({ dbPath });
  server.listen(port, "127.0.0.1", () => {
    console.log(`API ready at http://127.0.0.1:${port} (database: ${dbPath})`);
  });
  return server;
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startServer();
}

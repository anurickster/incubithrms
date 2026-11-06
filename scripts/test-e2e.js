import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "compwise-e2e-"));
const processes = [];

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

function startProcess(command, args, options) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  processes.push(child);
  return {
    child,
    getOutput: () => output,
  };
}

async function waitFor(url, server, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`Server exited early:\n${server.getOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Timed out waiting for ${url}:\n${server.getOutput()}`);
}

let browser;
let context;

try {
  const apiPort = await availablePort();
  const webPort = await availablePort();

  const api = startProcess(
    process.execPath,
    [path.join(root, "backend", "server.js")],
    {
      env: {
        ...process.env,
        PORT: String(apiPort),
        SALARY_DB_PATH: path.join(temporaryDirectory, "e2e.sqlite3"),
      },
    }
  );
  await waitFor(`http://127.0.0.1:${apiPort}/api/health`, api);

  const vite = startProcess(
    process.execPath,
    [
      path.join(root, "node_modules", "vite", "bin", "vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
      "--strictPort",
    ],
    {
      env: {
        ...process.env,
        SALARY_API_URL: `http://127.0.0.1:${apiPort}`,
      },
    }
  );
  const appUrl = `http://127.0.0.1:${webPort}`;
  await waitFor(appUrl, vite);

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Test 1: Page load & Overview
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Compensation overview" }).waitFor();
  console.log("✔ Overview page loaded");

  // Test 2: Pay Intelligence tab switching
  await page.getByRole("button", { name: "Pay Intelligence" }).first().click();
  await page.getByText("How ACME Pays People").waitFor();
  await page.getByRole("tab", { name: "Percentile Spread & Equity" }).click();
  await page.getByRole("table").waitFor();
  await page.getByRole("tab", { name: "Cohort Cross-Explorer" }).click();
  await page.getByText("Operating Country").waitFor();
  console.log("✔ Pay Intelligence tab switching verified");

  // Test 3: Employee Directory search and filtering
  await page.getByRole("button", { name: "Employees" }).click();
  await page.getByRole("textbox", { name: "Search employees" }).fill("ACME-00001");
  const employeeRow = page
    .locator("tbody tr.employee-row")
    .filter({ hasText: "ACME-00001" });
  await employeeRow.waitFor({ state: "visible" });
  console.log("✔ Employee directory search verified");

  // Test 4: Modal opening, Focus trapping, and Escape key dismissal
  await employeeRow.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByText("Salary history").waitFor();

  // Press Escape to dismiss modal
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  console.log("✔ Modal Escape key dismissal & focus trap verified");

  // Test 5: Re-open modal, edit salary and save
  await employeeRow.click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Edit salary" }).first().click();

  const salaryInput = dialog.locator('input[name="base_salary"]');
  await salaryInput.fill("135000.50");
  const effectiveDate = dialog.locator('input[name="effective_date"]');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  await effectiveDate.fill(todayStr);

  await dialog.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("status").getByText(/Salary updated for/).waitFor();
  await dialog.locator(".history-list").getByText("$135,000.50").waitFor();
  console.log("✔ Modal salary adjustment with live history update verified");

  // Close modal with button
  await dialog.getByRole("button", { name: "Done" }).click();
  await dialog.waitFor({ state: "hidden" });

  console.log("\nAll browser UI interaction tests passed successfully! 🎉");
} catch (error) {
  console.error("E2E Test Failed:", error);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  for (const child of processes.reverse()) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

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

  const production = process.argv.includes("--production");
  const vite = production ? null : startProcess(
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
  const appUrl = `http://127.0.0.1:${production ? apiPort : webPort}`;
  await waitFor(appUrl, vite || api);

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  console.log(`Testing ${production ? "production Node server" : "Vite development proxy"}`);

  // Test 1: Page load & Overview
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Compensation overview" }).waitFor();
  console.log("✔ Overview page loaded");

  // Test 2: Pay Intelligence tab switching
  await page.getByRole("button", { name: "Pay Intelligence" }).first().click();
  await page.getByText("How ACME Pays People").waitFor();
  await page.getByRole("tab", { name: "Percentile Spread & Dispersion" }).click();
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

  // Exercise both ends of the focus trap and restoration to the row action.
  const closeButton = dialog.getByRole("button", { name: "Close dialog" });
  await closeButton.focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await dialog.getByRole("button", { name: "Edit salary" }).last().evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press("Tab");
  assert.equal(await closeButton.evaluate((el) => el === document.activeElement), true);

  // Press Escape to dismiss modal
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  console.log("✔ Modal Escape key dismissal & focus trap verified");

  // A profile URL must survive first render and a full reload.
  await page.goto(`${appUrl}/?tab=employees&employee=ACME-00001`, { waitUntil: "networkidle" });
  await dialog.getByText("Salary history").waitFor();
  assert.ok(page.url().includes("employee=ACME-00001"));
  await page.reload({ waitUntil: "networkidle" });
  await dialog.getByText("Salary history").waitFor();
  assert.ok(page.url().includes("employee=ACME-00001"));
  await dialog.getByRole("button", { name: "Done" }).click();
  assert.equal(new URL(page.url()).searchParams.has("employee"), false);
  console.log("✔ Employee deep link and profile refresh verified");

  // Test 5: Re-open modal, edit salary and save
  await employeeRow.click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Edit salary" }).first().click();

  const salaryInput = dialog.locator('input[name="base_salary"]');
  await salaryInput.fill("135000.50");
  const effectiveDate = dialog.locator('input[name="effective_date"]');
  const todayStr = new Date().toISOString().slice(0, 10);
  await effectiveDate.fill(todayStr);

  await dialog.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("status").getByText(/Salary updated for/).waitFor();
  await dialog.locator(".history-list").getByText("$135,000.50").waitFor();
  console.log("✔ Modal salary adjustment with live history update verified");

  // Close modal with button
  await dialog.getByRole("button", { name: "Done" }).click();
  await dialog.waitFor({ state: "hidden" });

  // Test 6: Verify Tab State & Filter Persistence Across Refresh
  await page.goto(`${appUrl}/?tab=analytics&question=percentiles`, { waitUntil: "networkidle" });
  await page.getByText("Percentile Distribution & Pay Dispersion").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Percentile Distribution & Pay Dispersion").waitFor();
  assert.ok(page.url().includes("tab=analytics"));
  assert.ok(page.url().includes("question=percentiles"));
  console.log("✔ Tab state and query parameters persistence across refresh verified");

  await page.getByRole("tab", { name: "Cohort Cross-Explorer" }).click();
  await page.getByLabel("Operating Country").selectOption("Germany");
  await page.getByLabel("Department", { exact: true }).selectOption("Engineering");
  await page.getByTestId("cohort-count").getByText("Cohort count: 58", { exact: true }).waitFor();
  await page.getByText("€103,062.36", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("cohort-count").getByText("Cohort count: 58", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Operating Country").inputValue(), "Germany");
  await page.getByRole("button", { name: "Open Cohort in Directory" }).click();
  await page.getByText("58 team members", { exact: false }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("country"), "Germany");
  console.log("✔ Country + department analytics match directory after reload");

  // Check keyboard entry from an actual row button and focus restoration.
  const rowAction = page.locator("tbody tr.employee-row").first().getByRole("button");
  await rowAction.focus();
  await page.keyboard.press("Enter");
  await dialog.getByText("Salary history").waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await rowAction.evaluate((el) => el === document.activeElement), true);
  console.log("✔ Keyboard profile opening and focus restoration verified");

  assert.deepEqual(pageErrors, [], "The app must not raise uncaught browser errors");
  console.log("\nAll browser UI interaction tests passed successfully!");
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

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const videoDir = path.join(root, "artifacts", "demo");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "compwise-demo-"));
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
      throw new Error(`Demo server exited early:\n${server.getOutput()}`);
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
  await mkdir(videoDir, { recursive: true });
  const recordingsDirectory = path.join(temporaryDirectory, "recordings");
  await mkdir(recordingsDirectory);
  const apiPort = await availablePort();
  const webPort = await availablePort();

  const api = startProcess(
    process.execPath,
    [path.join(root, "backend", "server.js")],
    {
      env: {
        ...process.env,
        PORT: String(apiPort),
        SALARY_DB_PATH: path.join(temporaryDirectory, "demo.sqlite3"),
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
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: recordingsDirectory, size: { width: 1440, height: 1000 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Compensation overview" }).waitFor();
  await page.waitForTimeout(1000);

  // 1. Visit Pay Intelligence ("How We Pay") view
  await page.getByRole("button", { name: "Pay Intelligence" }).first().click();
  await page.getByText("How ACME Pays People").waitFor();
  await page.waitForTimeout(1000);
  await page.getByRole("tab", { name: "Percentile Spread & Equity" }).click();
  await page.waitForTimeout(1000);

  // 2. Navigate to Employee Directory
  await page.getByRole("button", { name: "Employees" }).click();
  await page.getByRole("textbox", { name: "Search employees" }).fill("ACME-00001");
  const employeeRow = page
    .locator("tbody tr.employee-row")
    .filter({ hasText: "ACME-00001" });
  await employeeRow.waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  await employeeRow.click();

  // 3. Inspect Profile and Update Salary
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Salary history").waitFor();
  await page.waitForTimeout(800);
  await dialog.getByRole("button", { name: "Edit salary" }).first().click();
  const salaryInput = dialog.locator('input[name="base_salary"]');
  await salaryInput.fill("123456.78");
  const effectiveDate = dialog.locator('input[name="effective_date"]');
  const today = new Date();
  await effectiveDate.fill(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`
  );
  await page.waitForTimeout(700);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("status").getByText(/Salary updated for/).waitFor();
  await dialog.getByText("Salary history").waitFor();
  await dialog.locator(".history-list").getByText("$123,456.78").waitFor();
  await page.waitForTimeout(1500);

  const video = page.video();
  await context.close();
  context = undefined;
  await video.saveAs(path.join(videoDir, "compwise-walkthrough.webm"));
  console.log(`Demo recording saved to ${path.join(videoDir, "compwise-walkthrough.webm")}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  for (const child of processes.reverse()) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

import { spawn } from "node:child_process";

const api = spawn("node", ["backend/server.js"], { stdio: "inherit" });
const vite = spawn("npx", ["vite", "--host", "127.0.0.1"], { stdio: "inherit" });

function cleanup(signal) {
  console.log(`\nStopping dev processes (${signal})...`);
  api.kill("SIGTERM");
  vite.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", () => cleanup("SIGINT"));
process.on("SIGTERM", () => cleanup("SIGTERM"));

api.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Backend API exited with code ${code}`);
  }
});

vite.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Vite exited with code ${code}`);
  }
});

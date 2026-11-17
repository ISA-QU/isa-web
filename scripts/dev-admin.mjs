#!/usr/bin/env node
/**
 * `npm run dev:admin`: the dashboard (http://localhost:3000/isa-web/) with its "Update data"
 * tab connected to the intake server on this computer. Both start together with a shared
 * one-time token that exists only in this process's memory (never written to disk), and stop
 * together. The intake server stays on 127.0.0.1 and accepts the dashboard's requests only from
 * http://localhost:3000.
 *
 * Without this, the tab is "off" (as on the live site). `npm run admin` remains the fallback.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DASHBOARD_PORT = 3000;
const INTAKE_PORT = 8765;
const DASHBOARD_ORIGIN = `http://localhost:${DASHBOARD_PORT}`;

/** Whether nothing is listening on the port yet. */
function portFree(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

for (const [port, what, host] of [
  [DASHBOARD_PORT, "the dashboard", undefined],
  [INTAKE_PORT, "the intake server", "127.0.0.1"],
]) {
  if (!(await portFree(port, host))) {
    console.error(
      `\n  Port ${port} is busy, so ${what} can't start there. Stop whatever is using it ` +
        `(often another "npm run dev" or "npm run admin") and try again.\n`,
    );
    process.exit(1);
  }
}

const token = randomBytes(24).toString("base64url");
const children = [];

function start(name, command, args, env) {
  const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split("\n")
      .filter((line) => line.trim())
      // Never echo the token.
      .map((line) => `[${name}] ${line.replaceAll(token, "…")}`)
      .join("\n");
  child.stdout.on("data", (chunk) => console.log(prefix(chunk)));
  child.stderr.on("data", (chunk) => console.error(prefix(chunk)));
  child.on("exit", (code) => {
    console.log(`\n  ${name} stopped (exit ${code}); stopping the other one too.`);
    stopAll();
  });
  children.push(child);
  return child;
}

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

start("intake", "python3", ["scripts/intake/admin_server.py"], {
  INTAKE_PORT: String(INTAKE_PORT),
  INTAKE_TOKEN: token,
  INTAKE_ALLOW_ORIGIN: DASHBOARD_ORIGIN,
});
start("dashboard", "npx", ["next", "dev", "--port", String(DASHBOARD_PORT), "--hostname", "localhost"], {
  NEXT_PUBLIC_UPLOAD_MODE: "local",
  NEXT_PUBLIC_INTAKE_URL: `http://127.0.0.1:${INTAKE_PORT}`,
  NEXT_PUBLIC_INTAKE_TOKEN: token,
});

console.log(
  `\n  Dashboard with the Update data tab connected to this computer:\n` +
    `    ${DASHBOARD_ORIGIN}/isa-web/?tab=update-data\n  Ctrl+C stops both.\n`,
);

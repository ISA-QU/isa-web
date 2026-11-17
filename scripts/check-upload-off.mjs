#!/usr/bin/env node
/**
 * `npm run check:upload-off`: proves the built site (out/) has the Update data tab in "off"
 * mode, so local mode can never reach the live site. `npm run deploy` runs it after the build
 * and before publishing; any failure stops the deploy.
 *
 * Fails when:
 * - an upload setting is in this build's environment or in a .env file Next reads for a
 *   production build (.env, .env.local, .env.production, .env.production.local);
 * - out/ contains this computer's address or the intake server's port;
 * - out/ contains an AWS API or Lambda address other than the dashboard's existing ones in
 *   app/lib/awsConfig.ts (an upload endpoint would be a new one);
 * - out/ doesn't contain the "Not connected yet" message (the off-mode tab).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The built site; another folder can be given to test this check itself.
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "out");
const SETTINGS = ["NEXT_PUBLIC_UPLOAD_MODE", "NEXT_PUBLIC_INTAKE_URL", "NEXT_PUBLIC_INTAKE_TOKEN", "NEXT_PUBLIC_UPLOAD_API_URL"];
const FORBIDDEN = [
  ["127.0.0.1", "this computer's address"],
  [":8765", "the intake server's port"],
];
// AWS API / Lambda addresses. The dashboard's own (loading the data) are allowed; any other is an endpoint
// that shouldn't be in an off-mode build. (When an upload setting isn't set, Next leaves its name in the
// code, where it reads as empty: that's the off state, so setting names alone aren't a problem.)
const AWS_URL = /https:\/\/[a-z0-9-]+\.(?:execute-api|lambda-url)\.[a-z0-9-]+\.(?:amazonaws\.com|on\.aws)[^\s"'`)]*/g;
const ALLOWED_AWS = [...readFileSync(path.join(ROOT, "app/lib/awsConfig.ts"), "utf8").matchAll(/https:\/\/[^\s"'`]+/g)].map((m) => m[0]);
const NOT_CONNECTED = "Not connected yet: updates are done on the office laptop until AWS is restored.";
const problems = [];

for (const name of SETTINGS) {
  const value = process.env[name];
  if (value && !(name === "NEXT_PUBLIC_UPLOAD_MODE" && value === "off")) problems.push(`${name} is set in this build's environment`);
}
for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && SETTINGS.includes(match[1]) && !(match[1] === "NEXT_PUBLIC_UPLOAD_MODE" && /^["']?off["']?$/.test(match[2].trim()))) {
      problems.push(`${match[1]} is set in ${file}, which a production build reads`);
    }
  }
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.(js|html|txt|json|css|map)$/.test(name)) yield full;
  }
}

let scanned = 0;
let foundMessage = false;
if (!existsSync(OUT)) {
  problems.push(`${path.relative(ROOT, OUT) || OUT} doesn't exist: run \`npm run build\` first`);
} else {
  for (const file of files(OUT)) {
    scanned += 1;
    const text = readFileSync(file, "utf8");
    if (text.includes(NOT_CONNECTED)) foundMessage = true;
    for (const [needle, what] of FORBIDDEN) {
      if (text.includes(needle)) problems.push(`${path.relative(ROOT, file)} contains ${what} (${needle})`);
    }
    for (const [url] of text.matchAll(AWS_URL)) {
      if (!ALLOWED_AWS.some((allowed) => url.startsWith(allowed))) {
        problems.push(`${path.relative(ROOT, file)} contains an AWS address that isn't one of the dashboard's own`);
      }
    }
  }
  if (!foundMessage) problems.push('out/ doesn\'t contain the Update data tab\'s "Not connected yet" message');
}

if (problems.length > 0) {
  console.error("\n  Upload check FAILED: the built site isn't safely in off mode. Nothing was published.\n");
  for (const p of problems) console.error(`    - ${p}`);
  console.error("\n  Remove the setting (or the .env line) and build again.\n");
  process.exit(1);
}
console.log(
  `\n  Upload check passed: the Update data tab is off in out/ (${scanned} files scanned; no upload settings, ` +
    `no local address or port, no AWS address besides the dashboard's own).\n`,
);

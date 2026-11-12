#!/usr/bin/env node
/**
 * Runs the Bobcat assistant's tools in the terminal against the local snapshot
 * (public/dashboard-data/snapshot.json), so answers can be checked without the
 * site or sign-in. No network calls.
 *
 * Usage:
 *   node scripts/assistant-tools.mjs --list
 *   node scripts/assistant-tools.mjs country_overview India
 *   node scripts/assistant-tools.mjs country_overview India J1
 *   node scripts/assistant-tools.mjs list_markets sort=growing limit=5
 *   node scripts/assistant-tools.mjs restrictions Nigeria
 *   node scripts/assistant-tools.mjs events year=FY2020
 *   node scripts/assistant-tools.mjs definition "low volume"
 *
 * Positional values fill the tool's parameters in order; key=value sets one by
 * name. Options: --visa=F1|J1|Both (the Visa control, default F1),
 * --no-nationality (as on a snapshot without the monthly nationality table),
 * --json (the raw result).
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "public/dashboard-data/snapshot.json");

async function compile() {
  const outDir = await mkdtemp(path.join(tmpdir(), "assistant-tools-"));
  execFileSync(
    "npx",
    [
      "tsc",
      "app/lib/dashboard/assistant/tools.ts",
      "app/lib/dashboard/assistant/format.ts",
      "app/lib/dashboard/decode.ts",
      "--outDir", outDir,
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
    ],
    { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] },
  );
  return outDir;
}

const argv = process.argv.slice(2);
const flags = new Map(
  argv.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v = "true"] = a.slice(2).split("=");
    return [k, v];
  }),
);
const rest = argv.filter((a) => !a.startsWith("--"));

const outDir = await compile();
try {
  const tools = await import(pathToFileURL(path.join(outDir, "assistant/tools.js")).href);
  const { resultText } = await import(pathToFileURL(path.join(outDir, "assistant/format.js")).href);

  if (flags.has("list") || rest.length === 0) {
    console.log("\nBobcat tools:\n");
    for (const t of tools.TOOLS) {
      const params = Object.entries(t.params).map(([k, p]) => (p.optional ? `[${k}]` : k)).join(" ");
      console.log(`  ${t.name} ${params}\n      ${t.description}`);
    }
    console.log("");
  } else {
    let snapshot;
    try {
      snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8"));
    } catch {
      console.error(`\n  Missing ${path.relative(ROOT, SNAPSHOT)}. Run \`npm run dashboard:data\` first.\n`);
      process.exitCode = 1;
    }
    if (snapshot) {
      if (flags.has("no-nationality")) {
        delete snapshot.nationalityMonthly;
        snapshot.coverage = { ...snapshot.coverage, nationalityMonthly: null };
      }
      const { decodeSnapshot } = await import(pathToFileURL(path.join(outDir, "decode.js")).href);
      const data = decodeSnapshot(snapshot);
      const [name, ...values] = rest;
      const def = tools.toolByName(name);
      const args = {};
      const names = def ? Object.keys(def.params) : [];
      let next = 0;
      for (const v of values) {
        const eq = v.indexOf("=");
        if (eq > 0) args[v.slice(0, eq)] = v.slice(eq + 1);
        else if (next < names.length) args[names[next++]] = v;
      }
      for (const k of ["min", "limit"]) if (args[k] !== undefined) args[k] = Number(args[k]);
      const visa = { f1: "F1", j1: "J1", both: "Both" }[String(flags.get("visa") ?? "F1").toLowerCase()] ?? "F1";
      const result = tools.runTool(name, { data, visa }, args);
      console.log(flags.has("json") ? JSON.stringify(result, null, 2) : `\n${resultText(result, { withLink: true })}\n`);
    }
  }
} finally {
  await rm(outDir, { recursive: true, force: true });
}

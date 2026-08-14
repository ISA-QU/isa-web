#!/usr/bin/env node
/**
 * Verifies the ported TypeScript metrics against values the original Python
 * produced, so a regression in the port shows up as a failed check rather than
 * a quietly wrong number on the dashboard.
 *
 * Two independent sources of truth:
 *   1. Hardcoded controls from the Streamlit project's own validation code
 *      (dashboard/utils/data_v2_shadow.py and docs/two_table_production_architecture_audit.md).
 *   2. country_historical_metrics.csv, built by the Python pipeline. app.py
 *      recomputes the same metrics at runtime, so our port must reproduce that
 *      file across all 209 countries.
 *
 * Usage: node scripts/verify-dashboard-data.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) {
    failures += 1;
    console.log(`    FAIL  ${label}\n            expected ${expected}\n            actual   ${actual}`);
  } else {
    console.log(`    ok    ${label}  =  ${actual}`);
  }
}

function checkClose(label, actual, expected, tolerance = 0.01) {
  checks += 1;
  const ok =
    actual === null || expected === null
      ? actual === expected
      : Math.abs(actual - expected) <= tolerance;
  if (!ok) {
    failures += 1;
    console.log(`    FAIL  ${label}\n            expected ${expected}\n            actual   ${actual}`);
  } else {
    console.log(`    ok    ${label}  =  ${actual}`);
  }
}

/** Compiles the dashboard lib to CommonJS so plain Node can require it. */
async function compileLib() {
  const outDir = await mkdtemp(path.join(tmpdir(), "dashboard-verify-"));
  execFileSync(
    "npx",
    [
      "tsc",
      "app/lib/dashboard/metrics.ts",
      "app/lib/dashboard/constants.ts",
      "app/lib/dashboard/types.ts",
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

const parseCsvLine = (line) => {
  const cells = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") { cells.push(field); field = ""; }
    else field += char;
  }
  cells.push(field);
  return cells;
};

async function main() {
  const dataDir = path.join(ROOT, "dashboard-data");
  const read = async (name) => JSON.parse(await readFile(path.join(dataDir, name), "utf8"));

  const outDir = await compileLib();
  const metrics = await import(pathToFileURL(path.join(outDir, "metrics.js")).href);

  const VISA = ["F1", "J1"];
  const operationalTable = await read("operational.json");
  const annualTable = await read("annual-country.json");
  const postsTable = await read("posts-monthly.json");

  const decode = (table, mapper) => {
    const rows = new Array(table.rowCount);
    for (let i = 0; i < table.rowCount; i += 1) rows[i] = mapper(table, i);
    return rows;
  };

  const operational = decode(operationalTable, (t, i) => ({
    post: t.dims.post[t.cols.post[i]],
    country: t.dims.country[t.cols.country[i]],
    visa: VISA[t.cols.visa[i]],
    year: t.cols.year[i],
    month: t.cols.month[i],
    issuances: t.cols.issuances[i],
  }));

  const annualCountry = decode(annualTable, (t, i) => ({
    fiscalYear: t.cols.fiscalYear[i],
    country: t.dims.country[t.cols.country[i]],
    visa: VISA[t.cols.visa[i]],
    issuances: t.cols.issuances[i],
  }));

  const postsMonthly = decode(postsTable, (t, i) => ({
    year: t.cols.year[i],
    month: t.cols.month[i],
    fiscalYear: t.cols.fiscalYear[i],
    post: t.dims.post[t.cols.post[i]],
    country: t.dims.country[t.cols.country[i]],
    visa: VISA[t.cols.visa[i]],
    issuances: t.cols.issuances[i],
    monthIndex: t.cols.year[i] * 12 + (t.cols.month[i] - 1),
  }));

  const sum = (rows) => rows.reduce((total, r) => total + r.issuances, 0);

  console.log("\n  Operational layer  (docs/two_table_production_architecture_audit.md)");
  check("rows", operational.length, 13278);
  check("F1 total", sum(operational.filter((r) => r.visa === "F1")), 1060905);
  check("J1 total", sum(operational.filter((r) => r.visa === "J1")), 878172);

  console.log("\n  Consulate history  (utils/data_v2_shadow.py: validate_consulate_controls)");
  check("rows", postsMonthly.length, 40175);
  check("distinct months", new Set(postsMonthly.map((r) => `${r.year}-${r.month}`)).size, 103);
  check("F1 total", sum(postsMonthly.filter((r) => r.visa === "F1")), 3037511);
  check("J1 total", sum(postsMonthly.filter((r) => r.visa === "J1")), 2417151);
  const inWindow = (r) => r.monthIndex >= 2023 * 12 && r.monthIndex <= 2025 * 12 + 8;
  check(
    "India F1 Jan2023-Sep2025",
    sum(postsMonthly.filter((r) => r.country === "India" && r.visa === "F1" && inWindow(r))),
    221096,
  );
  check(
    "Zimbabwe F1 Jan2023-Sep2025",
    sum(postsMonthly.filter((r) => r.country === "Zimbabwe" && r.visa === "F1" && inWindow(r))),
    4224,
  );

  console.log("\n  Country history  (utils/data_v2_shadow.py: validate_country_controls)");
  const countryValue = (year, country, visa) =>
    sum(
      annualCountry.filter(
        (r) => r.fiscalYear === year && r.country === country && r.visa === visa,
      ),
    );
  check("India FY2024 F1", countryValue(2024, "India", "F1"), 86067);
  check("India FY2024 J1", countryValue(2024, "India", "J1"), 12080);
  check("China mainland FY2024 F1", countryValue(2024, "China - mainland", "F1"), 82654);
  check("Nepal FY2024 F1", countryValue(2024, "Nepal", "F1"), 13184);
  check("Nigeria FY2024 F1", countryValue(2024, "Nigeria", "F1"), 6175);
  check("Zimbabwe FY2024 F1", countryValue(2024, "Zimbabwe", "F1"), 1526);
  check("fiscal year coverage", `${Math.min(...annualCountry.map((r) => r.fiscalYear))}-${Math.max(...annualCountry.map((r) => r.fiscalYear))}`, "1997-2024");

  console.log("\n  Ported metrics vs country_historical_metrics.csv");
  console.log("    (pipeline/build_historical_metrics.py reads the UN-harmonized file and uses a");
  console.log("     different 'Low volume' rule, so only harmonization-untouched countries and the");
  console.log("     arithmetic columns are comparable. app.py keeps the two apart for the same reason.)");

  const readCsv = async (relative) => {
    const lines = (await readFile(path.join(ROOT, relative), "utf8")).trim().split("\n");
    const header = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    });
  };

  const reference = await readCsv(
    "dashboard/data/processed/annual_country_historical/country_historical_metrics.csv",
  );
  const harmonized = await readCsv(
    "dashboard/data/processed/annual_country_historical/f1_j1_historical_1997_2024_harmonized.csv",
  );

  // Any country whose rows record a harmonization action was renamed or merged,
  // so the pre-harmonization CSV is not a valid expectation for it.
  const touched = new Set(
    harmonized
      .filter((row) => (row.harmonization_actions ?? "unchanged") !== "unchanged")
      .map((row) => row.country),
  );

  const ported = metrics.buildHistoricalMetricsFromAnnual(annualCountry);
  const portedByCountry = new Map(ported.map((row) => [row.country, row]));
  const comparable = reference.filter(
    (ref) => !touched.has(ref.country) && portedByCountry.has(ref.country),
  );

  console.log(
    `    info  comparing ${comparable.length} of ${reference.length} reference rows ` +
      `(${touched.size} countries excluded as harmonization-affected)`,
  );

  const numeric = (value) => (value === "" || value === undefined ? null : Number(value));
  const mismatches = { latestF1: [], latestJ1: [], growth5: [], growth10: [], cagr10: [], peakYear: [] };

  for (const ref of comparable) {
    const row = portedByCountry.get(ref.country);
    const compare = (bucket, actual, expected, tolerance = 0.011) => {
      const same =
        actual === null || expected === null
          ? actual === expected
          : Math.abs(actual - expected) <= tolerance;
      if (!same) mismatches[bucket].push(`${ref.country}: expected ${expected}, got ${actual}`);
    };
    compare("latestF1", row.latestF1, numeric(ref.latest_f1), 0);
    compare("latestJ1", row.latestJ1, numeric(ref.latest_j1), 0);
    compare("growth5", row.f1Growth5yrPct, numeric(ref.f1_growth_5yr_pct));
    compare("growth10", row.f1Growth10yrPct, numeric(ref.f1_growth_10yr_pct));
    compare("cagr10", row.f1Cagr10yrPct, numeric(ref.f1_cagr_10yr_pct));
    compare("peakYear", row.peakHistoricalF1Year, numeric(ref.peak_historical_f1_year), 0);
  }

  for (const [field, list] of Object.entries(mismatches)) {
    checks += 1;
    if (list.length === 0) {
      console.log(`    ok    ${field.padEnd(10)} matches for all ${comparable.length} comparable countries`);
    } else {
      failures += 1;
      console.log(`    FAIL  ${field.padEnd(10)} ${list.length} mismatch(es):`);
      for (const line of list.slice(0, 8)) console.log(`            ${line}`);
      if (list.length > 8) console.log(`            ... and ${list.length - 8} more`);
    }
  }

  console.log("\n  Unit checks on the pure classifiers  (transcribed from app.py)");
  const trend = metrics.historicalTrendDirection;
  check("trend: low volume", trend(200, 200, 99), "Low volume");
  check("trend: accelerating", trend(50, 0, 5000), "Accelerating");
  check("trend: long-term growth", trend(10, 75, 5000), "Long-term growth");
  check("trend: declining", trend(-35, 0, 5000), "Declining");
  check("trend: long-term decline", trend(-20, -35, 5000), "Long-term decline");
  check("trend: stable", trend(15, 0, 5000), "Stable");
  check("trend: growing", trend(20, 0, 5000), "Growing");
  check("trend: softening", trend(-20, 0, 5000), "Softening");
  check("trend: insufficient baseline", trend(null, null, 5000), "Insufficient baseline");

  check("tier 1", metrics.marketTier(50000), "Tier 1 — Core Priority");
  check("tier 2", metrics.marketTier(15000), "Tier 2 — High Potential");
  check("tier 3", metrics.marketTier(5000), "Tier 3 — Strategic Niche");
  check("tier 4", metrics.marketTier(4999), "Tier 4 — Emerging / Monitor");

  check("pctGrowth zero baseline", metrics.pctGrowth(10, 0), null);
  check("pctGrowth null baseline", metrics.pctGrowth(10, null), null);
  checkClose("pctGrowth doubling", metrics.pctGrowth(200, 100), 100, 0);
  check("cagr zero current", metrics.calcCagr(0, 100, 10), -100);
  check("cagr null baseline", metrics.calcCagr(100, null, 10), null);
  checkClose("cagr 100->200 over 10y", metrics.calcCagr(200, 100, 10), 7.177, 0.001);

  check("concentration high", metrics.concentrationLabel(0.5), "High");
  check("concentration moderate", metrics.concentrationLabel(0.3), "Moderate");
  check("concentration distributed", metrics.concentrationLabel(0.29), "Distributed");
  check("volatility high", metrics.volatilityLabel(0.85), "High");
  check("volatility moderate", metrics.volatilityLabel(0.45), "Moderate");
  check("volatility low", metrics.volatilityLabel(0.44), "Low");
  check("seasonality high", metrics.seasonalityStrengthLabel(2.0), "High");
  check("seasonality moderate", metrics.seasonalityStrengthLabel(1.4), "Moderate");
  check("seasonality low", metrics.seasonalityStrengthLabel(1.39), "Low");

  // app.py: months at peak-4, peak-3, peak-2, wrapping across the year boundary.
  check("outreach window (Sep peak)", metrics.recommendedOutreachWindow(9), "May-July");
  check("outreach window (Feb peak)", metrics.recommendedOutreachWindow(2), "October-December");
  check("outreach window (none)", metrics.recommendedOutreachWindow(null), "N/A");

  // opportunity_score: volume (<=55) + growth (<=30) + stability (<=15)
  check("opportunity: no signals", metrics.opportunityScore(0, null, null), 35);
  check("opportunity: capped", metrics.opportunityScore(10_000_000, 100, 0), 100);

  console.log("\n  Spot checks on derived scores");
  const f1 = operational.filter((r) => r.visa === "F1");
  const indiaF1 = f1.filter((r) => r.country === "India");
  checkClose("India operational F1 total", metrics.sumBy(indiaF1, (r) => r.issuances), 221096, 0);
  const indiaGrowth = metrics.yoyGrowth(indiaF1);
  console.log(`    info  India yoy growth (Jan-Sep comparable) = ${indiaGrowth?.toFixed(2)}%`);
  const indiaCv = metrics.seasonalityCv(indiaF1);
  console.log(`    info  India seasonality CV = ${indiaCv?.toFixed(4)}`);
  check("India market tier", metrics.marketTier(221096), "Tier 1 — Core Priority");
  console.log(`    info  India opportunity score = ${metrics.opportunityScore(221096, indiaGrowth, indiaCv)}`);

  console.log("\n  Command Center frame");
  const frame = metrics.buildCommandCenterFrame(operational, annualCountry, postsMonthly, "F1");
  console.log(`    info  ${frame.length} countries classified`);
  const india = frame.find((r) => r.country === "India");
  check("India category", india.marketCategory, "Core");
  check("India region", india.region, "South Asia");
  const china = frame.find((r) => r.country === "China");
  check("China resolves annual history via alias", china.growth10yr !== null, true);
  checkClose("China 10yr growth matches FY2014->FY2024", china.growth10yr, -66.25, 0.02);
  const categories = {};
  for (const row of frame) categories[row.marketCategory] = (categories[row.marketCategory] ?? 0) + 1;
  console.log(`    info  categories: ${JSON.stringify(categories)}`);

  await rm(outDir, { recursive: true, force: true });

  console.log(
    `\n  ${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();

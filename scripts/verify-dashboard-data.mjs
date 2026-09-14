#!/usr/bin/env node
/**
 * Verifies the dashboard snapshot and the ported TypeScript metrics against
 * figures the original Streamlit project validated, so a regression in the data
 * pipeline or the port shows up as a failed check rather than a quietly wrong
 * number on the dashboard.
 *
 * Every control is historical, so none of them move when new months are
 * uploaded:
 *   - FY2024 annual nationality totals (utils/data_v2_shadow.py)
 *   - the Mar 2017 - Sep 2025 consulate totals and the Jan 2023 - Sep 2025
 *     country windows the Streamlit project reconciled against the raw reports
 *
 * Reads public/dashboard-data/snapshot.json, so run `npm run dashboard:data` first.
 *
 * Usage: node scripts/verify-dashboard-data.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "public/dashboard-data/snapshot.json");

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

async function main() {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8"));
  } catch {
    console.error(`\n  Missing ${path.relative(ROOT, SNAPSHOT)}. Run \`npm run dashboard:data\` first.\n`);
    process.exit(1);
  }

  const outDir = await compileLib();
  const metrics = await import(pathToFileURL(path.join(outDir, "metrics.js")).href);

  const VISA = ["F1", "J1"];
  const monthIndex = (year, month) => year * 12 + (month - 1);

  const p = snapshot.postsMonthly;
  const postsMonthly = Array.from({ length: p.rowCount }, (_, i) => {
    const year = p.cols.year[i];
    const month = p.cols.month[i];
    return {
      year,
      month,
      fiscalYear: month >= 10 ? year + 1 : year,
      post: p.dims.post[p.cols.post[i]],
      country: p.dims.country[p.cols.country[i]],
      visa: VISA[p.cols.visa[i]],
      issuances: p.cols.issuances[i],
      monthIndex: monthIndex(year, month),
    };
  });

  const a = snapshot.annualCountry;
  const annualCountry = Array.from({ length: a.rowCount }, (_, i) => ({
    fiscalYear: a.cols.fiscalYear[i],
    country: a.dims.country[a.cols.country[i]],
    visa: VISA[a.cols.visa[i]],
    issuances: a.cols.issuances[i],
  }));

  // Mirrors data.ts: the operational layer is the tail of the post data.
  const operational = postsMonthly.filter((r) => r.monthIndex >= snapshot.coverage.operational.start);
  const latestComplete = snapshot.coverage.annual.latestComplete;

  const sum = (rows) => rows.reduce((total, r) => total + r.issuances, 0);
  const inWindow = (start, end) => (r) => r.monthIndex >= start && r.monthIndex <= end;

  console.log("\n  Snapshot integrity");
  check("schema", snapshot.schema, "dashboard-snapshot@1");
  check("missing months in the post data", snapshot.validation.postsMonthly.missingMonths.length, 0);
  check("posts without a country", Object.keys(snapshot.validation.postsMonthly.unmappedPosts).length, 0);
  check("build warnings", snapshot.warnings.length, 0);
  check(
    "incomplete fiscal years before the latest complete one",
    snapshot.fiscalYears.filter((f) => !f.complete && f.fiscalYear < latestComplete).length,
    0,
  );

  console.log("\n  Consulate history, Mar 2017 - Sep 2025  (utils/data_v2_shadow.py: validate_consulate_controls)");
  const reconciled = postsMonthly.filter(inWindow(monthIndex(2017, 3), monthIndex(2025, 9)));
  check("rows", reconciled.length, 40175);
  check("F1 total", sum(reconciled.filter((r) => r.visa === "F1")), 3037511);
  check("J1 total", sum(reconciled.filter((r) => r.visa === "J1")), 2417151);
  const recentF1 = (country) =>
    sum(
      postsMonthly.filter(
        (r) =>
          r.country === country &&
          r.visa === "F1" &&
          inWindow(monthIndex(2023, 1), monthIndex(2025, 9))(r),
      ),
    );
  check("India F1 Jan2023-Sep2025", recentF1("India"), 221096);
  check("Zimbabwe F1 Jan2023-Sep2025", recentF1("Zimbabwe"), 4224);

  console.log("\n  Country history  (utils/data_v2_shadow.py: validate_country_controls)");
  const countryValue = (year, country, visa) =>
    sum(annualCountry.filter((r) => r.fiscalYear === year && r.country === country && r.visa === visa));
  check("India FY2024 F1", countryValue(2024, "India", "F1"), 86067);
  check("India FY2024 J1", countryValue(2024, "India", "J1"), 12080);
  check("China FY2024 F1 (nationality 'China - Mainland')", countryValue(2024, "China", "F1"), 82654);
  check("Nepal FY2024 F1", countryValue(2024, "Nepal", "F1"), 13184);
  check("Nigeria FY2024 F1", countryValue(2024, "Nigeria", "F1"), 6175);
  check("Zimbabwe FY2024 F1", countryValue(2024, "Zimbabwe", "F1"), 1526);
  check("first fiscal year", Math.min(...annualCountry.map((r) => r.fiscalYear)), 1997);

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

  const months = (year, list) => list.map((month) => ({ year, month, issuances: 1 }));
  check(
    "growth label: partial year",
    metrics.comparableGrowthLabel([...months(2025, [1, 2, 3]), ...months(2026, [1, 2])]),
    "2026 vs 2025 Jan–Feb Growth",
  );
  const all = Array.from({ length: 12 }, (_, i) => i + 1);
  check(
    "growth label: full years",
    metrics.comparableGrowthLabel([...months(2024, all), ...months(2025, all)]),
    "2025 vs 2024 Growth",
  );

  console.log("\n  Command Center and historical metrics");
  const frame = metrics.buildCommandCenterFrame(operational, annualCountry, postsMonthly, "F1", latestComplete);
  console.log(`    info  ${frame.length} countries classified, latest complete fiscal year FY${latestComplete}`);
  const india = frame.find((r) => r.country === "India");
  // A market's category moves with the data (India was Core on the old data and is Declining
  // after the 2025 drop), so the rule itself is checked on fixed inputs instead.
  console.log(
    `    info  India: ${india.marketCategory} (momentum ${india.latest12Momentum?.toFixed(1)}%, ` +
      `10-year growth ${india.growth10yr?.toFixed(1)}%)`,
  );
  check("India region", india.region, "South Asia");
  const categoryFor = (overrides) =>
    metrics.marketCategory({
      currentVolume: 60000,
      latest12Total: 25000,
      latest12Momentum: 5,
      growth10yr: 10,
      recoveryIndex: 100,
      ...overrides,
    });
  check("category: large and not declining", categoryFor({}), "Core");
  check(
    "category: large but structurally declining",
    categoryFor({ latest12Momentum: -25, growth10yr: -40 }),
    "Declining",
  );
  check("category: one weak signal is not a decline", categoryFor({ latest12Momentum: -25 }), "Core");
  const china = frame.find((r) => r.country === "China");
  check("China joins its annual history", china.growth10yr !== null, true);
  checkClose(
    "China F1 growth FY2014->FY2024 (the old dashboard's 10-year figure)",
    metrics.fiscalYearGrowth(annualCountry.filter((r) => r.country === "China"), ["F1"], 2024, 2014),
    -66.25,
    0.02,
  );
  const historical = metrics.buildHistoricalMetricsFromAnnual(annualCountry, latestComplete);
  check(
    "historical metrics all measured from the latest complete year",
    historical.every((r) => r.latestYear === latestComplete),
    true,
  );
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

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
      "app/lib/dashboard/consulates.ts",
      "app/lib/dashboard/periods.ts",
      "app/lib/dashboard/url.ts",
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
  const consulates = await import(pathToFileURL(path.join(outDir, "consulates.js")).href);
  const periods = await import(pathToFileURL(path.join(outDir, "periods.js")).href);
  const url = await import(pathToFileURL(path.join(outDir, "url.js")).href);

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

  console.log("\n  Monthly nationality table  (audit controls; fixed months, so they don't move as data arrives)");
  const n = snapshot.nationalityMonthly;
  const nationality = n
    ? Array.from({ length: n.rowCount }, (_, i) => {
        const year = n.cols.year[i];
        const month = n.cols.month[i];
        const country = n.dims.country[n.cols.country[i]];
        return {
          year,
          month,
          monthIndex: monthIndex(year, month),
          fiscalYear: month >= 10 ? year + 1 : year,
          country,
          visa: VISA[n.cols.visa[i]],
          issuances: n.cols.issuances[i],
          isCountry: !(n.dims.nonCountry ?? []).includes(country),
        };
      })
    : [];
  const natMonths = [...new Set(nationality.map((r) => r.monthIndex))].sort((x, y) => x - y);
  const stamp = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  const nonCountryInCountry = n ? (n.dims.nonCountry ?? []).every((name) => n.dims.country.includes(name)) : false;
  check(
    "table present: months, range, and nonCountry is a subset of country",
    n
      ? `${natMonths.length} months, ${stamp(natMonths[0])} to ${stamp(natMonths[natMonths.length - 1])}, subset ${nonCountryInCountry}`
      : "missing",
    "108 months, 2017-03 to 2026-02, subset true",
  );

  const latest12 = inWindow(monthIndex(2025, 3), monthIndex(2026, 2));
  const prior12 = inWindow(monthIndex(2024, 3), monthIndex(2025, 2));
  const f1Countries = nationality.filter((r) => r.visa === "F1" && r.isCountry);
  check("F1, countries only, Mar 2025 - Feb 2026", sum(f1Countries.filter(latest12)), 252159);
  check("F1, countries only, Mar 2024 - Feb 2025", sum(f1Countries.filter(prior12)), 385674);
  const indiaF1 = f1Countries.filter((r) => r.country === "India");
  const indiaNow = sum(indiaF1.filter(latest12));
  const indiaPrior = sum(indiaF1.filter(prior12));
  check("India F1 by nationality, Mar 2025 - Feb 2026", indiaNow, 30292);
  check("India F1 by nationality, Mar 2024 - Feb 2025", indiaPrior, 75060);
  checkClose(
    "India F1 change vs previous 12 months (%)",
    indiaPrior > 0 ? Math.round(((indiaNow - indiaPrior) / indiaPrior) * 1000) / 10 : null,
    -59.6,
    0.05,
  );

  // Monthly world totals by nationality (all rows) against the post totals.
  const totalsBy = (rows) => {
    const totals = new Map();
    for (const r of rows) {
      const key = `${r.monthIndex}|${r.visa}`;
      totals.set(key, (totals.get(key) ?? 0) + r.issuances);
    }
    return totals;
  };
  const natTotals = totalsBy(nationality);
  const postTotals = totalsBy(postsMonthly);
  const pairs = [...new Set([...natTotals.keys(), ...postTotals.keys()])];
  const diffs = pairs.map((key) => Math.abs((natTotals.get(key) ?? 0) - (postTotals.get(key) ?? 0)));
  const largest = diffs.length > 0 ? Math.max(...diffs) : null;
  check(`world totals vs post totals: largest monthly difference (${largest}) is at most 5`, largest !== null && largest <= 5, true);
  check("world totals vs post totals: month/visa pairs that match exactly", `${diffs.filter((d) => d === 0).length} of ${pairs.length}`, "202 of 216");

  const fy2025 = nationality.filter((r) => r.fiscalYear === 2025);
  check("FY2025 monthly sum, all rows: F1", sum(fy2025.filter((r) => r.visa === "F1")), 287915);
  check("FY2025 monthly sum, all rows: J1", sum(fy2025.filter((r) => r.visa === "J1")), 292742);
  const annual2025 = annualCountry.filter((r) => r.fiscalYear === 2025);
  check(
    "FY2025 monthly sum, countries only = the snapshot's annual table",
    `F1 ${sum(fy2025.filter((r) => r.visa === "F1" && r.isCountry))} / J1 ${sum(fy2025.filter((r) => r.visa === "J1" && r.isCountry))}`,
    `F1 ${sum(annual2025.filter((r) => r.visa === "F1"))} / J1 ${sum(annual2025.filter((r) => r.visa === "J1"))}`,
  );

  console.log("\n  Consulates page  (8-1: previous equal-length period, \"—\" rule, context line)");
  const coverage = snapshot.coverage.postsMonthly;
  const f1Posts = postsMonthly.filter((r) => r.visa === "F1");
  const recoveryYear = consulates.recoveryYearOf(postsMonthly);
  const last12Range = periods.resolvePeriod({ kind: "last12" }, coverage);
  const allRange = periods.resolvePeriod({ kind: "all" }, coverage);
  const indiaLast12 = consulates.buildConsulateTable(
    f1Posts, last12Range, consulates.previousPeriod(last12Range, coverage), "India", recoveryYear,
  );
  const mumbai12 = indiaLast12.find((r) => r.post === "Mumbai");
  check(
    "Mumbai F1, last 12 months: volume / change / recovery",
    mumbai12 ? `${mumbai12.volume} / ${mumbai12.change.toFixed(1)} / ${Math.round(mumbai12.recovery)}` : "missing",
    "6413 / -68.4 / 39",
  );
  const indiaAll = consulates.buildConsulateTable(
    f1Posts, allRange, consulates.previousPeriod(allRange, coverage), "India", recoveryYear,
  );
  const mumbaiAll = indiaAll.find((r) => r.post === "Mumbai");
  check(
    "Mumbai F1, Period = All: volume / change",
    mumbaiAll ? `${mumbaiAll.volume} / ${mumbaiAll.change === null ? "—" : mumbaiAll.change}` : "missing",
    "162287 / —",
  );
  check(
    "India scope, last 12 months: total across consulates",
    `${sum(indiaLast12.map((r) => ({ issuances: r.volume })))} across ${indiaLast12.length}`,
    "27258 across 5",
  );
  checkClose(
    "India scope, last 12 months: shares add to 100%",
    Math.round(indiaLast12.reduce((total, r) => total + r.share, 0) * 1000) / 1000,
    100,
    0.001,
  );
  const prior2024 = consulates.previousPeriod(periods.resolvePeriod({ kind: "year", year: 2024 }, coverage), coverage);
  check(
    "previous period of calendar year 2024",
    prior2024 ? `${stamp(prior2024.start)} to ${stamp(prior2024.end)}` : "none",
    "2023-01 to 2023-12",
  );
  check(
    "pre-pandemic preset (Jan 2019 - Dec 2022) has no previous period",
    consulates.previousPeriod(periods.resolvePeriod({ kind: "pandemic" }, coverage), coverage),
    null,
  );
  const context12 = consulates.consulateContext(postsMonthly, nationality, "India", last12Range, ["F1"]);
  check(
    "context line, India F1, last 12 months: issued in / received by",
    context12 ? `${context12.issuedIn} / ${context12.receivedBy}` : "hidden",
    "27258 / 30292",
  );
  check(
    "context line hidden when nationalityMonthly is missing",
    consulates.consulateContext(postsMonthly, null, "India", last12Range, ["F1"]),
    null,
  );

  console.log("\n  Country 360  (8-2a: Country Intelligence merged in; old links; leader matches Consulates)");
  const tabIds = ["command", "executive", "country-360", "consulates", "historical-trends"];
  check("old country-intelligence links open", url.canonicalTab("country-intelligence", tabIds), "country-360");
  check(
    "old consulate-intelligence / historical-consulates links open",
    `${url.canonicalTab("consulate-intelligence", tabIds)} / ${url.canonicalTab("historical-consulates", tabIds)}`,
    "consulates / consulates",
  );
  const indiaF1History = postsMonthly.filter((r) => r.country === "India" && r.visa === "F1");
  const indiaHc = metrics.postPeriodMetrics(indiaF1History);
  check(
    "Country 360 India F1: last 12 months / change / recovery",
    `${sum(indiaF1History.filter(inWindow(last12Range.start, last12Range.end)))} / ${indiaHc.latest12Change.toFixed(1)} / ${Math.round(indiaHc.recoveryIndex)}`,
    "27258 / -62.2 / 64",
  );
  const periodLeader = indiaLast12[0];
  check(
    "Country 360 Period leader, India F1, last 12 months (same calculation as Consulates)",
    periodLeader ? `${periodLeader.post} ${periodLeader.share.toFixed(1)}%` : "missing",
    "Hyderabad 29.9%",
  );

  await rm(outDir, { recursive: true, force: true });

  console.log(
    `\n  ${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();

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
import { createHash } from "node:crypto";
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
      "app/lib/dashboard/measures.ts",
      "app/lib/dashboard/sort.ts",
      "app/lib/dashboard/rolling.ts",
      "app/lib/dashboard/format.ts",
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
  const measures = await import(pathToFileURL(path.join(outDir, "measures.js")).href);
  const sorting = await import(pathToFileURL(path.join(outDir, "sort.js")).href);
  const rolling = await import(pathToFileURL(path.join(outDir, "rolling.js")).href);
  const format = await import(pathToFileURL(path.join(outDir, "format.js")).href);

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
  const frame = metrics.buildCommandCenterFrame(
    operational, annualCountry, postsMonthly, "F1", latestComplete, snapshot.coverage.postsMonthly,
  );
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
  const recoveryYear = consulates.recoveryYearOf(coverage);
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
  const indiaHc = metrics.postPeriodMetrics(indiaF1History, { dataEnd: coverage.end, recoveryYear });
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


  console.log("\n  Fix Pack A1  (data end, minimum base of 100, links, What to do; expected values recounted with pandas from the raw by-post workbook)");
  check("latest complete year from the coverage", measures.latestCompleteYearOf(coverage), 2025);
  const lowOr = (value, digits = 1) => (value === null ? "low volume" : value.toFixed(digits));
  const rowFor = (country, visa = "F1") =>
    metrics.buildCommandCenterFrame(
      operational, annualCountry, postsMonthly, visa, latestComplete, coverage, [country],
    )[0];
  const signals = (country) => {
    const r = rowFor(country);
    return `${r.latest12Total} / ${r.prior12Total} / ${lowOr(r.latest12Momentum)} / ${lowOr(r.recoveryIndex)}`;
  };
  check("Venezuela F1 (Caracas last reported Jan 2019): last 12 / previous 12 / change / recovery", signals("Venezuela"), "0 / 0 / low volume / low volume");
  const venezuela = rowFor("Venezuela");
  check(
    "Venezuela What to do: action / why",
    `${venezuela.recommendedAction} / ${venezuela.primaryDriver}`,
    "Insufficient Evidence / No visas issued locally in the last 12 months",
  );
  check("Russia F1: last 12 / previous 12 / change / recovery", signals("Russia"), "5 / 21 / low volume / 0.1");
  check("Myanmar F1: last 12 / previous 12 / change / recovery", signals("Myanmar"), "130 / 1705 / -92.4 / 25.2");
  check("Ukraine F1: last 12 / previous 12 / change / recovery", signals("Ukraine"), "8 / 5 / low volume / 1.1");
  check("Afghanistan F1 recovery (2025 vs 2019, not 2019 vs 2019)", lowOr(rowFor("Afghanistan").recoveryIndex), "0.0");
  check(
    "Ukraine and Myanmar not flagged Recovery Leader",
    ["Ukraine", "Myanmar"].filter((c) => rowFor(c).secondaryFlags.includes("Recovery Leader")).length,
    0,
  );
  check(
    "Country 360 (one country) and Command Center (all) give the same action for every country, F1",
    frame.filter((r) => rowFor(r.country).recommendedAction !== r.recommendedAction).length,
    0,
  );
  const leaders = sorting.sortBy(frame.filter((r) => r.recoveryIndex !== null), [(r) => r.recoveryIndex]).slice(0, 12);
  check("Recovery Leaders: top", `${leaders[0].country} ${Math.round(leaders[0].recoveryIndex)}`, "Nepal 323");
  check(
    "Recovery Leaders: Guinea (2019 base 19) and Eritrea (1) left out",
    ["Guinea", "Eritrea"].filter((c) => leaders.some((r) => r.country === c)).length,
    0,
  );
  check(
    "no Recovery Leader flag on a 2019 base below 100",
    frame.filter((r) => r.secondaryFlags.includes("Recovery Leader") && r.baseline2019 < 100).length,
    0,
  );
  const zeroLocal = frame.filter((r) => r.latest12Total === 0);
  console.log(
    `    info  ${zeroLocal.length} countries with no F1 issued locally in the last 12 months ` +
      `(${zeroLocal.filter((r) => r.hasConsulateData).length} with consulate history)`,
  );
  const allF1Last12 = consulates.buildConsulateTable(
    f1Posts, last12Range, consulates.previousPeriod(last12Range, coverage), null, recoveryYear,
  );
  const postRow = (post) => allF1Last12.find((r) => r.post === post);
  const kinshasa = postRow("Kinshasa");
  check("Consulates, Kinshasa F1 last 12 months: 80 vs 716, change", `${kinshasa.volume} vs ${kinshasa.prior}, ${lowOr(kinshasa.change)}`, "80 vs 716, -88.8");
  check("Consulates, Moscow F1 recovery (3,768 in 2019 to 6)", lowOr(postRow("Moscow").recovery), "0.2");
  const kyiv = postRow("Kyiv");
  check("Consulates, Kyiv F1: change (5 to 8) / recovery", `${lowOr(kyiv.change)} / ${lowOr(kyiv.recovery)}`, "low volume / 1.1");

  const f1Rolling = rolling.rollingTotals(postsMonthly, coverage.end, (r) => (r.visa === "F1" ? r.country : null));
  const lowCountries = [...f1Rolling.groups.values()].filter((g) => g.prior > 0 && measures.changeVsBase(g.current, g.prior) === null);
  check("header and globe: countries whose F1 change is now low volume", lowCountries.length, 26);
  checkClose("header India F1 change unchanged", Math.round(measures.changeVsBase(27258, 72112) * 10) / 10, -62.2, 0);

  const movers = (visa) => {
    const pool = metrics
      .buildCommandCenterFrame(operational, annualCountry, postsMonthly, visa, latestComplete, coverage)
      .filter((r) => r.latest12Momentum !== null && r.latest12Total >= 100 && r.prior12Total >= 100);
    const up = sorting.sortBy(pool.filter((r) => r.latest12Momentum > 0), [(r) => r.latest12Momentum]).slice(0, 10);
    const down = sorting.sortBy(pool.filter((r) => r.latest12Momentum < 0), [(r) => r.latest12Momentum], true).slice(0, 10);
    return `${up.map((r) => r.country).join(", ")} | ${down.map((r) => r.country).join(", ")}`;
  };
  check(
    "Command Center risers | fallers, F1 (identical to before A1)",
    movers("F1"),
    "Belgium, Lithuania, Austria, Romania, Iceland, Slovenia, Luxembourg, Cyprus, Curacao | Myanmar, Armenia, Cote d'Ivoire, Nepal, Netherlands, Nigeria, India, Eswatini, Angola, Malawi",
  );
  check(
    "Command Center risers | fallers, F1 + J1 (identical to before A1)",
    movers("Both"),
    "Bosnia and Herzegovina, Kazakhstan, Belgium, Albania, Moldova, Kosovo, Hungary, Serbia, United Kingdom, Austria | Myanmar, Democratic Republic of the Congo, Turkmenistan, Armenia, Cote d'Ivoire, Nepal, Paraguay, Netherlands, India, Nigeria",
  );
  const postMovers = rolling.risersAndFallers(
    rolling.rollingTotals(postsMonthly, coverage.end, (r) => (r.visa === "F1" ? r.post : null)).groups,
  );
  check(
    "Consulates risers | fallers, F1 (identical to before A1)",
    `${postMovers.risers.map(([p]) => p).join(", ")} | ${postMovers.fallers.map(([p]) => p).join(", ")}`,
    "Porto Alegre, Naples, Brussels, Brasilia, Vilnius, Guadalajara, Warsaw, Rome, Vienna, Tijuana | Rangoon, Yerevan, Abidjan, Abuja, Mumbai, Kathmandu, Vancouver, Amsterdam, Ottawa, Karachi",
  );

  const linked = (param) => {
    const choice = periods.periodFromLink(param, coverage);
    return choice ? periods.resolvePeriod(choice, coverage).label : "rejected";
  };
  check(
    "links: period=2010 / 2030-01_2031-01 / 2023-13_2024-01",
    `${linked("2010")} / ${linked("2030-01_2031-01")} / ${linked("2023-13_2024-01")}`,
    "rejected / rejected / rejected",
  );
  check("links: period=2017 is kept, labelled as partial", linked("2017"), "2017 (Mar–Dec)");
  check(
    "a period outside the data is labelled as all months, not the requested year",
    periods.resolvePeriod({ kind: "year", year: 2010 }, coverage).label,
    "All (since Mar 2017)",
  );
  const countryNames = [...new Set([...postsMonthly.map((r) => r.country), ...annualCountry.map((r) => r.country)])];
  check("links: country=china / INDIA / unknown", `${url.matchOption("china", countryNames)} / ${url.matchOption("INDIA", countryNames)} / ${url.matchOption("Atlantis", countryNames)}`, "China / India / undefined");

  console.log("\n  Fix Pack A2  (missing months count as 0; one typical-year peak; expected values recounted with pandas from the raw by-post workbook)");
  const typicalYrs = measures.typicalYearsOf(coverage);
  check("typical years", typicalYrs.join(", "), "2018, 2019, 2022, 2023, 2024, 2025");
  const f1Of = (pick) => postsMonthly.filter((r) => r.visa === "F1" && pick(r));
  const indiaTypical = measures.typicalYear(f1Of((r) => r.country === "India"), typicalYrs);
  check(
    "India F1 typical year, average per month: Jan / May / Aug (unchanged)",
    [1, 5, 8].map((m) => Math.round(indiaTypical.averages[m - 1])).join(" / "),
    "1893 / 5526 / 6903",
  );
  const frameA2 = new Map(frame.map((r) => [r.country, r]));
  check(
    "peak month (typical year): India / China / Ukraine / Egypt / Pakistan",
    ["India", "China", "Ukraine", "Egypt", "Pakistan"].map((c) => frameA2.get(c).peakMonthName).join(" / "),
    "June / June / July / July / July",
  );
  check("Mumbai peak month (typical year)", metrics.peakMonthLabel(measures.typicalYear(f1Of((r) => r.post === "Mumbai"), typicalYrs)), "June");
  check(
    "Mauritania (17 a year) / Afghanistan (38 a year): peak month",
    `${frameA2.get("Mauritania").peakMonthName} / ${frameA2.get("Afghanistan").peakMonthName}`,
    "— (low volume) / — (low volume)",
  );
  check(
    "low-volume peaks also hide the seasonality ratio",
    frame.filter((r) => r.peakMonthName === measures.LOW_VOLUME && r.seasonalityRatio !== null).length,
    0,
  );
  const f1ByCountry = new Map();
  for (const r of f1Of(() => true)) {
    if (!f1ByCountry.has(r.country)) f1ByCountry.set(r.country, []);
    f1ByCountry.get(r.country).push(r);
  }
  check(
    "every page's peak month agrees with Command Center for every country (F1)",
    [...f1ByCountry].filter(([c, rows]) => metrics.peakMonthLabel(measures.typicalYear(rows, typicalYrs)) !== frameA2.get(c).peakMonthName).length,
    0,
  );
  check(
    "F1 countries / consulates with a low-volume peak",
    `${[...f1ByCountry.values()].filter((rows) => measures.typicalYear(rows, typicalYrs).lowVolume).length} / ${
      [...new Set(f1Of(() => true).map((r) => r.post))].filter((post) => measures.typicalYear(f1Of((r) => r.post === post), typicalYrs).lowVolume).length
    }`,
    "31 / 41",
  );
  const perMonth = (post, range) => format.perMonthText(measures.averagePerMonthIn(f1Of((r) => r.post === post), range));
  check(
    "average per month: Rangoon last 12 / Caracas All / Mumbai All",
    `${perMonth("Rangoon", last12Range)} / ${perMonth("Caracas", allRange)} / ${perMonth("Mumbai", allRange)}`,
    "10.8 / 29.7 / 1,503",
  );
  const vol = (post, range) => {
    const cv = measures.volatilityIn(f1Of((r) => r.post === post && r.monthIndex >= range.start && r.monthIndex <= range.end), range);
    return `${cv.toFixed(2)} ${metrics.volatilityLabel(cv)}`;
  };
  check("volatility, last 12 months: Moscow / Kyiv", `${vol("Moscow", last12Range)} / ${vol("Kyiv", last12Range)}`, "1.54 High / 1.12 High");
  check("Russia F1 volatility, full history", frameA2.get("Russia").volatilityCv.toFixed(2), "2.02");
  const moscowSeries = measures.monthlySeries(f1Of((r) => r.post === "Moscow"), coverage);
  check(
    "Moscow trend line: points / months at 0",
    `${moscowSeries.length} / ${moscowSeries.filter((v) => v === 0).length}`,
    "108 / 46",
  );
  const kabul = f1Of((r) => r.post === "Kabul");
  const kabulBase = kabul.filter((r) => r.year === 2019).reduce((t, r) => t + r.issuances, 0);
  check(
    "Kabul recovery chart, 2019-2025 (drops to 0)",
    [2019, 2020, 2021, 2022, 2023, 2024, 2025]
      .map((y) => Math.round((kabul.filter((r) => r.year === y).reduce((t, r) => t + r.issuances, 0) / kabulBase) * 100))
      .join(", "),
    "100, 8, 3, 0, 0, 0, 0",
  );
  const fingerprint = (rows) =>
    createHash("sha1")
      .update(rows.map((r) => `${r.country}=${r.marketCategory}/${r.recommendedAction}`).sort().join("\n"))
      .digest("hex")
      .slice(0, 12);
  check("no F1 category or action changes vs A1 (every country)", fingerprint(frame), "2667c03ff99f");
  check(
    "no F1 + J1 category or action changes vs A1 (every country)",
    fingerprint(metrics.buildCommandCenterFrame(operational, annualCountry, postsMonthly, "Both", latestComplete, coverage)),
    "8a6ec0744bb9",
  );
  check("Canada J1 action (accepted change)", rowFor("Canada", "J1").recommendedAction, "Begin Outreach Earlier");
  check(
    "F1 flags: Volatile (A1 120, +24) / Highly Seasonal (A1 160, +1 -26)",
    `${frame.filter((r) => r.secondaryFlags.includes("Volatile")).length} / ${frame.filter((r) => r.secondaryFlags.includes("Highly Seasonal")).length}`,
    "144 / 135",
  );
  check(
    "Timing hidden with 0 local visas: Venezuela / Afghanistan (India keeps it)",
    `"${rowFor("Venezuela").timing}" / "${rowFor("Afghanistan").timing}" / ${frameA2.get("India").timing !== ""}`,
    '"" / "" / true',
  );

  await rm(outDir, { recursive: true, force: true });

  console.log(
    `\n  ${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();

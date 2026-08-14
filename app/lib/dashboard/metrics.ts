/**
 * Metric functions ported from the Streamlit dashboard (app.py, utils/data.py).
 *
 * These reproduce the pandas semantics the original relied on, which are not
 * always the obvious ones:
 *   - `groupby(...).idxmax()` breaks ties toward the *lowest sorted key*,
 *     because groupby sorts its keys before the max is taken.
 *   - `Series.std(ddof=0)` is the population standard deviation.
 *   - `pd.notna(None)` is False, so a missing metric silently skips a branch
 *     rather than raising.
 * Changing any of these changes published numbers, so they are preserved exactly.
 */

import {
  HISTORICAL_COUNTRY_ALIASES,
  MONTH_NAMES_FULL,
  MONTHLY_COUNTRY_ALIASES,
  REGION_MAP,
} from "./constants";
import type {
  AnnualCountryRow,
  CommandCenterRow,
  CountrySummaryRow,
  Coord,
  HistoricalMetricRow,
  OperationalRow,
  PostMonthlyRow,
  PostPeriodMetrics,
  Visa,
  VisaSelection,
} from "./types";

/* ------------------------------------------------------------------ *
 * Generic aggregation helpers (the pandas operations we actually use)
 * ------------------------------------------------------------------ */

export const sumBy = <T>(rows: readonly T[], pick: (row: T) => number): number =>
  rows.reduce((total, row) => total + pick(row), 0);

/** `groupby(key)[value].sum()`. Insertion-ordered; sort keys when order matters. */
export function groupSum<T, K>(
  rows: readonly T[],
  key: (row: T) => K,
  value: (row: T) => number,
): Map<K, number> {
  const out = new Map<K, number>();
  for (const row of rows) {
    const k = key(row);
    out.set(k, (out.get(k) ?? 0) + value(row));
  }
  return out;
}

/** `groupby(key)[value].mean()`. */
export function groupMean<T, K>(
  rows: readonly T[],
  key: (row: T) => K,
  value: (row: T) => number,
): Map<K, number> {
  const totals = new Map<K, { sum: number; count: number }>();
  for (const row of rows) {
    const k = key(row);
    const entry = totals.get(k) ?? { sum: 0, count: 0 };
    entry.sum += value(row);
    entry.count += 1;
    totals.set(k, entry);
  }
  return new Map([...totals].map(([k, { sum, count }]) => [k, sum / count]));
}

/** `groupby(key)[value].median()` — pandas averages the middle pair when even. */
export function groupMedian<T, K>(
  rows: readonly T[],
  key: (row: T) => K,
  value: (row: T) => number,
): Map<K, number> {
  const buckets = new Map<K, number[]>();
  for (const row of rows) {
    const k = key(row);
    const list = buckets.get(k);
    if (list) list.push(value(row));
    else buckets.set(k, [value(row)]);
  }
  const out = new Map<K, number>();
  for (const [k, values] of buckets) {
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    out.set(k, values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]);
  }
  return out;
}

/**
 * `groupby(...).idxmax()` for numeric keys: groupby sorts keys ascending, and
 * idxmax returns the first occurrence of the maximum, so ties resolve to the
 * smallest key.
 */
export function idxMaxNumeric(grouped: Map<number, number>): number | null {
  let bestKey: number | null = null;
  let bestValue = -Infinity;
  for (const key of [...grouped.keys()].sort((a, b) => a - b)) {
    const value = grouped.get(key)!;
    if (value > bestValue) {
      bestValue = value;
      bestKey = key;
    }
  }
  return bestKey;
}

/** As above, for string keys — ties resolve to the alphabetically first key. */
export function idxMaxString(grouped: Map<string, number>): string | null {
  let bestKey: string | null = null;
  let bestValue = -Infinity;
  for (const key of [...grouped.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const value = grouped.get(key)!;
    if (value > bestValue) {
      bestValue = value;
      bestKey = key;
    }
  }
  return bestKey;
}

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length;

/** Population standard deviation — pandas `std(ddof=0)`. */
export function stdPopulation(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const avg = mean(values);
  const variance = values.reduce((total, v) => total + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Python's `round()` — banker's rounding, ties to even. */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Mirrors `pd.notna` for the nullable numbers these functions pass around. */
export const notNa = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && !Number.isNaN(value);

const round2 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100) / 100;

/* ------------------------------------------------------------------ *
 * Core ratios
 * ------------------------------------------------------------------ */

/** `pct_growth` — undefined when the baseline is missing or non-positive. */
export function pctGrowth(current: number, baseline: number | null): number | null {
  if (!notNa(baseline) || baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

/** `calc_cagr` — a zero current value is reported as a total (-100%) decline. */
export function calcCagr(
  current: number,
  baseline: number | null,
  years: number,
): number | null {
  if (years <= 0 || !notNa(baseline) || baseline <= 0) return null;
  if (current === 0) return -100;
  return ((current / baseline) ** (1 / years) - 1) * 100;
}

/**
 * `yoy_growth` — compares the two most recent years over only the calendar
 * months present in both, so a partial current year is not penalised.
 */
export function yoyGrowth(rows: readonly OperationalRow[]): number | null {
  if (rows.length === 0) return null;
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  if (years.length < 2) return null;
  const prevYear = years[years.length - 2];
  const currentYear = years[years.length - 1];

  const prevMonths = new Set(rows.filter((r) => r.year === prevYear).map((r) => r.month));
  const currentMonths = new Set(rows.filter((r) => r.year === currentYear).map((r) => r.month));
  const comparableMonths = new Set([...prevMonths].filter((m) => currentMonths.has(m)));
  if (comparableMonths.size === 0) return null;

  const comparable = rows.filter((r) => comparableMonths.has(r.month));
  const annual = groupSum(comparable, (r) => r.year, (r) => r.issuances);
  const prev = annual.get(prevYear) ?? 0;
  const current = annual.get(currentYear) ?? 0;
  if (prev <= 0) return null;
  return ((current - prev) / prev) * 100;
}

/** `seasonality_cv` — coefficient of variation across calendar months. */
export function seasonalityCv(rows: readonly OperationalRow[]): number | null {
  if (rows.length === 0) return null;
  const monthly = groupSum(rows, (r) => r.month, (r) => r.issuances);
  if (monthly.size < 2) return null;
  const values = [...monthly.values()];
  const avg = mean(values);
  if (avg === 0) return null;
  return stdPopulation(values) / avg;
}

export function marketTier(total: number): string {
  if (total >= 50_000) return "Tier 1 — Core Priority";
  if (total >= 15_000) return "Tier 2 — High Potential";
  if (total >= 5_000) return "Tier 3 — Strategic Niche";
  return "Tier 4 — Emerging / Monitor";
}

/**
 * `opportunity_score` — volume (max 55) + growth (max 30) + stability (max 15).
 * A missing growth or CV scores mid-range rather than zero.
 */
export function opportunityScore(
  total: number,
  growth: number | null,
  cv: number | null,
): number {
  const volumeScore = Math.min(55, (Math.log1p(Math.max(total, 0)) / Math.log1p(150_000)) * 55);
  const growthScore = !notNa(growth) ? 20 : Math.max(0, Math.min(30, 15 + growth / 2));
  const stabilityScore = !notNa(cv) ? 15 : Math.max(0, Math.min(15, 15 - cv * 8));
  return roundHalfToEven(
    Math.max(0, Math.min(100, volumeScore + growthScore + stabilityScore)),
  );
}

/* ------------------------------------------------------------------ *
 * Country summary (Executive tab + globe)
 * ------------------------------------------------------------------ */

export function buildCountrySummary(
  f1: readonly OperationalRow[],
  j1: readonly OperationalRow[],
  coords: Record<string, Coord>,
): CountrySummaryRow[] {
  const countries = [...new Set([...f1.map((r) => r.country), ...j1.map((r) => r.country)])].sort();

  const rows = countries.map((country) => {
    const cf1 = f1.filter((r) => r.country === country);
    const cj1 = j1.filter((r) => r.country === country);
    const f1Total = sumBy(cf1, (r) => r.issuances);
    const growth = yoyGrowth(cf1);
    const cv = seasonalityCv(cf1);
    const postTotals = groupSum(cf1, (r) => r.post, (r) => r.issuances);
    const monthTotals = groupSum(cf1, (r) => r.month, (r) => r.issuances);
    const coord = coords[country];

    return {
      country,
      f1Total,
      j1Total: sumBy(cj1, (r) => r.issuances),
      growthPct: growth,
      seasonalityCv: cv,
      tier: marketTier(f1Total),
      opportunityScore: opportunityScore(f1Total, growth, cv),
      topPost: postTotals.size > 0 ? (idxMaxString(postTotals) ?? "N/A") : "N/A",
      peakMonth: monthTotals.size > 0 ? (idxMaxNumeric(monthTotals) ?? 0) : 0,
      lat: coord ? coord.lat : null,
      lon: coord ? coord.lon : null,
    };
  });

  return rows.sort((a, b) => b.f1Total - a.f1Total);
}

/* ------------------------------------------------------------------ *
 * Trend classification
 * ------------------------------------------------------------------ */

export function historicalTrendDirection(
  growth5yr: number | null,
  growth10yr: number | null,
  latestF1: number,
): string {
  if (latestF1 < 100) return "Low volume";
  if (notNa(growth5yr) && growth5yr >= 50) return "Accelerating";
  if (notNa(growth10yr) && growth10yr >= 75) return "Long-term growth";
  if (notNa(growth5yr) && growth5yr <= -35) return "Declining";
  if (notNa(growth10yr) && growth10yr <= -35) return "Long-term decline";
  if (notNa(growth5yr) && Math.abs(growth5yr) <= 15) return "Stable";
  if (notNa(growth5yr) && growth5yr > 0) return "Growing";
  if (notNa(growth5yr) && growth5yr < 0) return "Softening";
  return "Insufficient baseline";
}

export function historicalRangeTrendDirection(
  growthPct: number | null,
  latestF1: number,
  yearSpan: number,
): string {
  if (latestF1 < 100) return "Low volume";
  if (yearSpan < 2 || !notNa(growthPct)) return "Insufficient range";
  if (growthPct >= 50) return "Accelerating";
  if (growthPct >= 15) return "Growing";
  if (growthPct <= -35) return "Declining";
  if (growthPct < -15) return "Softening";
  return "Stable";
}

/** One `{fiscalYear, F1, J1}` row of the annual pivot used by Historical Trends. */
export interface AnnualPivotRow {
  fiscalYear: number;
  F1: number;
  J1: number;
}

/** Pivot annual rows to `fiscal_year x visa_class`, filling gaps with zero. */
export function buildAnnualPivot(rows: readonly AnnualCountryRow[]): AnnualPivotRow[] {
  const byYear = new Map<number, AnnualPivotRow>();
  for (const row of rows) {
    const entry = byYear.get(row.fiscalYear) ?? { fiscalYear: row.fiscalYear, F1: 0, J1: 0 };
    entry[row.visa] += row.issuances;
    byYear.set(row.fiscalYear, entry);
  }
  return [...byYear.values()].sort((a, b) => a.fiscalYear - b.fiscalYear);
}

export interface HistoricalRangeMetrics {
  latestF1: number | null;
  latestJ1: number | null;
  rangeGrowthPct: number | null;
  cagr10yrPct: number | null;
  peakF1Year: number | null;
  peakF1: number | null;
  trendDirection: string;
}

export function calculateHistoricalRangeMetrics(
  pivot: readonly AnnualPivotRow[],
): HistoricalRangeMetrics {
  if (pivot.length === 0) {
    return {
      latestF1: null,
      latestJ1: null,
      rangeGrowthPct: null,
      cagr10yrPct: null,
      peakF1Year: null,
      peakF1: null,
      trendDirection: "N/A",
    };
  }

  const sorted = [...pivot].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const yearSpan = latest.fiscalYear - first.fiscalYear;

  const rangeGrowth = yearSpan > 0 ? pctGrowth(latest.F1, first.F1) : null;

  const tenYearBase = sorted.find((r) => r.fiscalYear === latest.fiscalYear - 10);
  const cagr10yr =
    yearSpan >= 10 && tenYearBase ? calcCagr(latest.F1, tenYearBase.F1, 10) : null;

  const peak = idxMaxNumeric(new Map(sorted.map((r) => [r.fiscalYear, r.F1])))!;
  const peakRow = sorted.find((r) => r.fiscalYear === peak)!;

  return {
    latestF1: latest.F1,
    latestJ1: latest.J1,
    rangeGrowthPct: rangeGrowth,
    cagr10yrPct: cagr10yr,
    peakF1Year: peak,
    peakF1: peakRow.F1,
    trendDirection: historicalRangeTrendDirection(rangeGrowth, latest.F1, yearSpan),
  };
}

/** `build_historical_metrics_from_annual` — per-country 5yr/10yr trend metrics. */
export function buildHistoricalMetricsFromAnnual(
  rows: readonly AnnualCountryRow[],
): HistoricalMetricRow[] {
  if (rows.length === 0) return [];
  const latestYear = Math.max(...rows.map((r) => r.fiscalYear));
  const fiveYearBase = latestYear - 5;
  const tenYearBase = latestYear - 10;

  const byCountry = new Map<string, AnnualCountryRow[]>();
  for (const row of rows) {
    const list = byCountry.get(row.country);
    if (list) list.push(row);
    else byCountry.set(row.country, [row]);
  }

  const metrics = [...byCountry.keys()].sort().map((country) => {
    const pivot = buildAnnualPivot(byCountry.get(country)!);
    const at = (year: number) => pivot.find((r) => r.fiscalYear === year) ?? null;

    const latest = at(latestYear);
    const latestF1 = latest ? latest.F1 : 0;
    const latestJ1 = latest ? latest.J1 : 0;
    const f1FiveBase = at(fiveYearBase)?.F1 ?? null;
    const f1TenBase = at(tenYearBase)?.F1 ?? null;

    const growth5yr = pctGrowth(latestF1, f1FiveBase);
    const growth10yr = pctGrowth(latestF1, f1TenBase);
    const cagr10yr = calcCagr(latestF1, f1TenBase, 10);

    const peakYear =
      pivot.length > 0
        ? idxMaxNumeric(new Map(pivot.map((r) => [r.fiscalYear, r.F1])))!
        : latestYear;
    const peakF1 = pivot.length > 0 ? (at(peakYear)?.F1 ?? 0) : 0;

    return {
      country,
      latestYear,
      latestF1,
      latestJ1,
      f1Growth5yrPct: round2(growth5yr),
      f1Growth10yrPct: round2(growth10yr),
      f1Cagr10yrPct: round2(cagr10yr),
      peakHistoricalF1: peakF1,
      peakHistoricalF1Year: peakYear,
      trendDirection: historicalTrendDirection(growth5yr, growth10yr, latestF1),
    };
  });

  return metrics.sort((a, b) => b.latestF1 - a.latestF1);
}

/* ------------------------------------------------------------------ *
 * Qualitative labels
 * ------------------------------------------------------------------ */

export function concentrationLabel(value: number | null): string {
  if (!notNa(value)) return "N/A";
  if (value >= 0.5) return "High";
  if (value >= 0.3) return "Moderate";
  return "Distributed";
}

export function volatilityLabel(cv: number | null): string {
  if (!notNa(cv)) return "N/A";
  if (cv >= 0.85) return "High";
  if (cv >= 0.45) return "Moderate";
  return "Low";
}

export function seasonalityStrengthLabel(ratio: number | null): string {
  if (!notNa(ratio)) return "N/A";
  if (ratio >= 2.0) return "High";
  if (ratio >= 1.4) return "Moderate";
  return "Low";
}

/** Outreach window: the three months ending two months before the peak. */
export function recommendedOutreachWindow(peakMonth: number | null): string {
  if (!peakMonth || !notNa(peakMonth)) return "N/A";
  const months = [4, 3, 2].map(
    (offset) => MONTH_NAMES_FULL[(((peakMonth - offset - 1) % 12) + 12) % 12 + 1],
  );
  return `${months[0]}-${months[months.length - 1]}`;
}

export const historicalCountryName = (country: string): string =>
  HISTORICAL_COUNTRY_ALIASES[country] ?? country;

export const monthlyCountryName = (country: string): string =>
  MONTHLY_COUNTRY_ALIASES[country] ?? country;

export const regionForCountry = (country: string): string =>
  REGION_MAP[country] ?? REGION_MAP[monthlyCountryName(country)] ?? "Other";

export const selectedVisaClasses = (selection: VisaSelection): Visa[] =>
  selection === "Both" ? ["F1", "J1"] : [selection];

/* ------------------------------------------------------------------ *
 * Consulate-history metrics
 * ------------------------------------------------------------------ */

/** Most recent calendar year with all 12 months present. */
export function latestCompleteYear(rows: readonly PostMonthlyRow[]): number | null {
  const monthsByYear = new Map<number, Set<number>>();
  for (const row of rows) {
    const set = monthsByYear.get(row.year) ?? new Set<number>();
    set.add(row.month);
    monthsByYear.set(row.year, set);
  }
  const complete = [...monthsByYear.entries()]
    .filter(([, months]) => months.size === 12)
    .map(([year]) => year);
  return complete.length > 0 ? Math.max(...complete) : null;
}

export function postPeriodMetrics(rows: readonly PostMonthlyRow[]): PostPeriodMetrics {
  if (rows.length === 0) {
    return {
      total: 0,
      latest12: 0,
      peakMonth: null,
      peakMonthName: "N/A",
      seasonalityRatio: null,
      seasonalityStrength: "N/A",
      volatilityCv: null,
      volatility: "N/A",
      baseline2019: null,
      recoveryIndex: null,
      latest12Change: null,
    };
  }

  const monthly = groupSum(rows, (r) => r.monthIndex, (r) => r.issuances);
  const latestIndex = Math.max(...monthly.keys());
  const latest12Start = latestIndex - 11;
  const prior12Start = latestIndex - 23;

  let latest12 = 0;
  let prior12 = 0;
  for (const [index, value] of monthly) {
    if (index >= latest12Start) latest12 += value;
    else if (index >= prior12Start) prior12 += value;
  }
  const latest12Change = prior12 > 0 ? pctGrowth(latest12, prior12) : null;

  const monthAvg = groupMean(rows, (r) => r.month, (r) => r.issuances);
  const monthAvgValues = [...monthAvg.values()];
  const monthAvgMean = mean(monthAvgValues);
  const peakMonth = monthAvg.size > 0 ? idxMaxNumeric(monthAvg) : null;
  const seasonalityRatio =
    monthAvg.size > 0 && monthAvgMean ? Math.max(...monthAvgValues) / monthAvgMean : null;

  const monthlyValues = [...monthly.values()];
  const monthlyMean = mean(monthlyValues);
  const cv =
    monthlyValues.length > 1 && monthlyMean
      ? stdPopulation(monthlyValues) / monthlyMean
      : null;

  const annual = groupSum(rows, (r) => r.year, (r) => r.issuances);
  const baseline2019 = annual.get(2019) ?? 0;

  let recoveryIndex: number | null = null;
  if (baseline2019 > 0) {
    const throughSeptember = groupSum(
      rows.filter((r) => r.month <= 9),
      (r) => r.year,
      (r) => r.issuances,
    );
    const latestYear = Math.max(...rows.map((r) => r.year));
    const base2019 = throughSeptember.get(2019) ?? 0;
    const current2025 = throughSeptember.get(2025);
    if (latestYear === 2025 && base2019 > 0 && current2025 !== undefined) {
      recoveryIndex = (current2025 / base2019) * 100;
    } else {
      const completeYear = latestCompleteYear(rows);
      if (completeYear !== null && annual.has(completeYear)) {
        recoveryIndex = (annual.get(completeYear)! / baseline2019) * 100;
      }
    }
  }

  return {
    total: sumBy(rows, (r) => r.issuances),
    latest12,
    peakMonth,
    peakMonthName: peakMonth !== null ? (MONTH_NAMES_FULL[peakMonth] ?? "N/A") : "N/A",
    seasonalityRatio,
    seasonalityStrength: seasonalityStrengthLabel(seasonalityRatio),
    volatilityCv: cv,
    volatility: volatilityLabel(cv),
    baseline2019: baseline2019 > 0 ? baseline2019 : null,
    recoveryIndex,
    latest12Change,
  };
}

/* ------------------------------------------------------------------ *
 * Command Center classification
 * ------------------------------------------------------------------ */

export function fiscalYearGrowth(
  rows: readonly AnnualCountryRow[],
  visaClasses: readonly Visa[],
  currentYear: number,
  baselineYear: number,
): number | null {
  const scoped = rows.filter((r) => visaClasses.includes(r.visa));
  const current = sumBy(
    scoped.filter((r) => r.fiscalYear === currentYear),
    (r) => r.issuances,
  );
  const baseline = sumBy(
    scoped.filter((r) => r.fiscalYear === baselineYear),
    (r) => r.issuances,
  );
  return pctGrowth(current, baseline);
}

/** Inputs to the classification rules, before category/flags are attached. */
type ClassificationInput = Omit<
  CommandCenterRow,
  | "marketCategory"
  | "secondaryFlags"
  | "secondaryFlagsText"
  | "confidence"
  | "recommendedAction"
  | "primaryDriver"
  | "counterSignal"
  | "timing"
  | "caveat"
  | "evidence"
>;

/**
 * Primary market category. Rules are mutually exclusive and evaluated in order;
 * see docs/command_center_classification_audit.md in the original project.
 */
export function marketCategory(row: ClassificationInput): string {
  const currentVolume = row.currentVolume || 0;
  const latest12 = row.latest12Total || 0;
  const momentum = row.latest12Momentum;
  const growth10yr = row.growth10yr;
  const recovery = row.recoveryIndex;

  const structurallyDeclining =
    notNa(growth10yr) && growth10yr <= -35 && notNa(momentum) && momentum <= -20;

  if ((currentVolume >= 50_000 || latest12 >= 20_000) && !structurallyDeclining) return "Core";
  if (structurallyDeclining && currentVolume >= 500) return "Declining";
  if (notNa(momentum) && momentum >= 25 && latest12 >= 250 && currentVolume < 25_000) {
    return "Emerging";
  }
  if (notNa(growth10yr) && growth10yr >= 50 && latest12 >= 500) return "Growth";
  if (notNa(recovery) && recovery >= 115 && latest12 >= 500) return "Recovery";
  return "Watch";
}

export function secondaryFlags(row: ClassificationInput & { marketCategory: string }): string[] {
  const flags: string[] = [];
  if (notNa(row.growth10yr) && row.growth10yr >= 35) flags.push("Strong Long-Term Growth");
  if (notNa(row.latest12Momentum) && row.latest12Momentum <= -20) flags.push("Weak Recent Momentum");
  if (notNa(row.recoveryIndex) && row.recoveryIndex >= 115) flags.push("Recovery Leader");
  if (notNa(row.seasonalityRatio) && row.seasonalityRatio >= 1.7) flags.push("Highly Seasonal");
  if (notNa(row.topOneShare) && row.topOneShare >= 0.45) flags.push("High Concentration");
  if (notNa(row.volatilityCv) && row.volatilityCv >= 0.85) flags.push("Volatile");
  if (["Core", "Growth", "Recovery"].includes(row.marketCategory) && notNa(row.peakMonth)) {
    flags.push("Travel Opportunity");
  }
  if ((row.latest12Total || 0) < 100 || !notNa(row.growth10yr)) flags.push("Low Confidence");
  flags.push("Partial-Year Caution");
  return flags;
}

export function dataConfidenceLabel(
  row: ClassificationInput & { secondaryFlags: string[] },
): string {
  if (row.secondaryFlags.includes("Low Confidence")) return "Low";
  const missing = [row.growth10yr, row.latest12Momentum, row.recoveryIndex].filter(
    (value) => !notNa(value),
  ).length;
  if (missing >= 2) return "Medium";
  return "High";
}

export function recommendedAction(
  row: ClassificationInput & { marketCategory: string; secondaryFlags: string[] },
): string {
  const { marketCategory: category, secondaryFlags: flags } = row;
  const seasonality = row.seasonalityRatio;
  const momentum = row.latest12Momentum;
  const growth10yr = row.growth10yr;

  if (category === "Declining") return "Review Structural Decline";
  if (flags.includes("Weak Recent Momentum") && notNa(growth10yr) && growth10yr >= 20) {
    return "Monitor Current Slowdown";
  }
  if (category === "Core") return "Maintain Strategic Priority";
  if (category === "Emerging") return "Increase Digital Outreach";
  if (category === "Growth") return "Expand Recruitment";
  if (category === "Recovery") return "Consider Travel";
  if (flags.includes("High Concentration")) return "Monitor Specific Consulate";
  if (notNa(seasonality) && seasonality >= 1.7) return "Begin Outreach Earlier";
  if (notNa(momentum) && momentum <= -20) return "Monitor Current Slowdown";
  if ((row.latest12Total || 0) < 100) return "Insufficient Evidence";
  return "Maintain Strategic Priority";
}

/** `+12.3%` — Python's `f"{value:+.1f}%"`. */
export const signedPct = (value: number): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

export function recommendationProfile(
  row: ClassificationInput & {
    recommendedAction: string;
    confidence: string;
  },
): {
  primaryDriver: string;
  counterSignal: string;
  timing: string;
  caveat: string;
} {
  const action = row.recommendedAction || "Insufficient Evidence";
  let primaryDriver = "Insufficient comparable evidence";
  let counterSignal = "No material counter-signal";
  let timing = "Review during the next recruitment-cycle planning window";
  let caveat =
    "Use with application, admission, deposit, and enrollment data before allocating resources.";

  if (notNa(row.latest12Momentum)) {
    primaryDriver = `Latest 12-month momentum is ${signedPct(row.latest12Momentum)}`;
  }
  if (
    ["Expand Recruitment", "Maintain Strategic Priority"].includes(action) &&
    notNa(row.growth10yr)
  ) {
    primaryDriver = `10-year growth is ${signedPct(row.growth10yr)}`;
  }
  if (action === "Review Structural Decline" && notNa(row.growth10yr) && notNa(row.latest12Momentum)) {
    primaryDriver = `10-year growth is ${signedPct(row.growth10yr)} and latest momentum is ${signedPct(row.latest12Momentum)}`;
  }
  if (action === "Begin Outreach Earlier" && row.peakMonthName) {
    primaryDriver = `Peak issuance month is ${row.peakMonthName}`;
  }

  if (
    notNa(row.growth10yr) &&
    row.growth10yr >= 20 &&
    notNa(row.latest12Momentum) &&
    row.latest12Momentum < 0
  ) {
    counterSignal = `10-year growth remains ${signedPct(row.growth10yr)}`;
    caveat = "Recent weakness does not erase long-term strategic importance.";
  } else if (
    notNa(row.latest12Momentum) &&
    row.latest12Momentum > 0 &&
    notNa(row.growth10yr) &&
    row.growth10yr < 0
  ) {
    counterSignal = `Recent momentum is ${signedPct(row.latest12Momentum)} despite weaker long-term history`;
  } else if (notNa(row.recoveryIndex)) {
    counterSignal = `Recovery index is ${row.recoveryIndex.toFixed(0)} versus 2019 comparable baseline`;
  }

  if (row.peakMonth) {
    timing = `${recommendedOutreachWindow(row.peakMonth)} outreach before ${row.peakMonthName} peak`;
  }
  if (action === "Monitor Current Slowdown") {
    timing = "Review before the next recruitment-cycle allocation";
  }
  if (action === "Prepare for Peak Support Workload") {
    timing = `Prepare support capacity before ${row.peakMonthName || "the peak month"}`;
  }

  return { primaryDriver, counterSignal, timing, caveat };
}

export function evidenceText(row: ClassificationInput): string {
  const pieces: string[] = [];
  if (notNa(row.growth10yr)) pieces.push(`10-year growth ${signedPct(row.growth10yr)}`);
  if (notNa(row.latest12Momentum)) {
    pieces.push(`latest 12-month momentum ${signedPct(row.latest12Momentum)}`);
  }
  if (notNa(row.recoveryIndex)) {
    pieces.push(`recovery index ${row.recoveryIndex.toFixed(0)}`);
  }
  if (row.peakMonthName) pieces.push(`peak month ${row.peakMonthName}`);
  return pieces.length > 0 ? pieces.join("; ") : "Insufficient comparable evidence";
}

/**
 * `build_command_center_frame` — joins the three data layers per country while
 * keeping their grains separate: operational volume, annual nationality history,
 * and monthly consulate history.
 */
export function buildCommandCenterFrame(
  operational: readonly OperationalRow[],
  annualCountry: readonly AnnualCountryRow[],
  consulate: readonly PostMonthlyRow[],
  visaSelection: VisaSelection,
): CommandCenterRow[] {
  const visaClasses = selectedVisaClasses(visaSelection);
  if (annualCountry.length === 0) return [];
  const latestHistYear = Math.max(...annualCountry.map((r) => r.fiscalYear));

  const countries = [
    ...new Set([
      ...operational.map((r) => r.country),
      ...consulate.map((r) => r.country),
      ...annualCountry.map((r) => monthlyCountryName(r.country)),
    ]),
  ].sort();

  const opTotals = groupSum(
    operational.filter((r) => visaClasses.includes(r.visa)),
    (r) => r.country,
    (r) => r.issuances,
  );

  const annualByCountry = new Map<string, AnnualCountryRow[]>();
  for (const row of annualCountry) {
    const list = annualByCountry.get(row.country);
    if (list) list.push(row);
    else annualByCountry.set(row.country, [row]);
  }

  const consulateByCountry = new Map<string, PostMonthlyRow[]>();
  for (const row of consulate) {
    if (!visaClasses.includes(row.visa)) continue;
    const list = consulateByCountry.get(row.country);
    if (list) list.push(row);
    else consulateByCountry.set(row.country, [row]);
  }

  const latestIndex = consulate.length > 0 ? Math.max(...consulate.map((r) => r.monthIndex)) : null;
  const latest12Start = latestIndex !== null ? latestIndex - 11 : null;
  const prior12Start = latestIndex !== null ? latestIndex - 23 : null;

  const rows = countries.map((country) => {
    const annualRows = annualByCountry.get(historicalCountryName(country)) ?? [];
    const consulateRows = consulateByCountry.get(country) ?? [];
    const currentVolume = opTotals.get(country) ?? 0;

    let latest12Total = 0;
    let prior12Total = 0;
    let recoveryIndex: number | null = null;
    let seasonalityRatio: number | null = null;
    let volatilityCv: number | null = null;
    let peakMonth: number | null = null;
    let topOneShare: number | null = null;
    let topThreeShare: number | null = null;

    if (consulateRows.length > 0 && latest12Start !== null && prior12Start !== null) {
      for (const row of consulateRows) {
        if (row.monthIndex >= latest12Start) latest12Total += row.issuances;
        else if (row.monthIndex >= prior12Start) prior12Total += row.issuances;
      }

      const comparable2025 = sumBy(
        consulateRows.filter((r) => r.year === 2025 && r.month <= 9),
        (r) => r.issuances,
      );
      const comparable2019 = sumBy(
        consulateRows.filter((r) => r.year === 2019 && r.month <= 9),
        (r) => r.issuances,
      );
      recoveryIndex = comparable2019 > 0 ? (comparable2025 / comparable2019) * 100 : null;

      const monthly = groupSum(consulateRows, (r) => r.monthIndex, (r) => r.issuances);
      const monthlyValues = [...monthly.values()];
      const monthlyMean = mean(monthlyValues);
      volatilityCv =
        monthlyValues.length > 1 && monthlyMean
          ? stdPopulation(monthlyValues) / monthlyMean
          : null;

      const monthAvg = groupMean(consulateRows, (r) => r.month, (r) => r.issuances);
      const monthAvgValues = [...monthAvg.values()];
      const monthAvgMean = mean(monthAvgValues);
      if (monthAvg.size > 0 && monthAvgMean) {
        peakMonth = idxMaxNumeric(monthAvg);
        seasonalityRatio = Math.max(...monthAvgValues) / monthAvgMean;
      }

      const postTotals = [...groupSum(consulateRows, (r) => r.post, (r) => r.issuances).values()].sort(
        (a, b) => b - a,
      );
      const countryTotal = postTotals.reduce((a, b) => a + b, 0);
      if (countryTotal) {
        topOneShare = postTotals.slice(0, 1).reduce((a, b) => a + b, 0) / countryTotal;
        topThreeShare = postTotals.slice(0, 3).reduce((a, b) => a + b, 0) / countryTotal;
      }
    }

    const growth5yr =
      annualRows.length > 0
        ? fiscalYearGrowth(annualRows, visaClasses, latestHistYear, latestHistYear - 5)
        : null;
    const growth10yr =
      annualRows.length > 0
        ? fiscalYearGrowth(annualRows, visaClasses, latestHistYear, latestHistYear - 10)
        : null;

    let cagr10yr: number | null = null;
    if (annualRows.length > 0) {
      const scoped = annualRows.filter((r) => visaClasses.includes(r.visa));
      const current = sumBy(
        scoped.filter((r) => r.fiscalYear === latestHistYear),
        (r) => r.issuances,
      );
      const baseline = sumBy(
        scoped.filter((r) => r.fiscalYear === latestHistYear - 10),
        (r) => r.issuances,
      );
      cagr10yr = calcCagr(current, baseline, 10);
    }

    const momentum = prior12Total > 0 ? pctGrowth(latest12Total, prior12Total) : null;

    const base: ClassificationInput = {
      country,
      region: regionForCountry(country),
      currentVolume,
      growth5yr,
      growth10yr,
      cagr10yr,
      latest12Total,
      prior12Total,
      latest12Momentum: momentum,
      recoveryIndex,
      peakMonth,
      peakMonthName: peakMonth ? (MONTH_NAMES_FULL[peakMonth] ?? "N/A") : "N/A",
      seasonalityRatio,
      volatilityCv,
      topOneShare,
      topThreeShare,
      concentrationRisk: concentrationLabel(topOneShare),
    };

    const category = marketCategory(base);
    const flags = secondaryFlags({ ...base, marketCategory: category });
    const confidence = dataConfidenceLabel({ ...base, secondaryFlags: flags });
    const action = recommendedAction({
      ...base,
      marketCategory: category,
      secondaryFlags: flags,
    });
    const profile = recommendationProfile({ ...base, recommendedAction: action, confidence });

    return {
      ...base,
      marketCategory: category,
      secondaryFlags: flags,
      secondaryFlagsText: flags.join(", "),
      confidence,
      recommendedAction: action,
      ...profile,
      evidence: evidenceText(base),
    };
  });

  // pandas sorts by both columns descending.
  return rows.sort(
    (a, b) => b.currentVolume - a.currentVolume || b.latest12Total - a.latest12Total,
  );
}

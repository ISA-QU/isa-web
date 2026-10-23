/**
 * Shared rules for the dashboard's numbers, so every page works them out the
 * same way:
 *   - "Last 12 months" and "latest complete year" come from the data's coverage
 *     (e.g. Feb 2026 and 2025), the same for every country and consulate, never
 *     from one country's or consulate's own last row.
 *   - A % change or recovery index is shown only when the earlier figure (the
 *     previous period, or 2019) is at least 100; otherwise "— (low volume)".
 *     A big base falling to almost nothing still shows.
 *
 * No imports from metrics.ts, so metrics.ts can use these without a cycle.
 */

import type { MonthRange } from "./types";

/** The smallest earlier figure (previous period or 2019) a % change or recovery is shown for. */
export const MIN_BASE = 100;

/** Shown instead of a % change or recovery index whose base is below MIN_BASE. */
export const LOW_VOLUME = "— (low volume)";

/** What "What to do" says for a country with no visas issued in it in the last 12 months. */
export const NO_LOCAL_VISAS = "No visas issued locally in the last 12 months";

interface Issued {
  monthIndex: number;
  year: number;
  issuances: number;
}

const total = (rows: readonly Issued[], keep: (row: Issued) => boolean): number => {
  let sum = 0;
  for (const row of rows) if (keep(row)) sum += row.issuances;
  return sum;
};

/** The latest calendar year fully inside the data's coverage (2025 when the data runs to Feb 2026). */
export function latestCompleteYearOf(coverage: MonthRange): number | null {
  for (let year = Math.floor(coverage.end / 12); year * 12 >= coverage.start; year -= 1) {
    if (year * 12 + 11 <= coverage.end) return year;
  }
  return null;
}

/** % change, or null when the base is below MIN_BASE (shown as "— (low volume)"). */
export function changeVsBase(current: number, base: number): number | null {
  if (!(base >= MIN_BASE)) return null;
  return ((current - base) / base) * 100;
}

export const isLowVolume = (base: number): boolean => !(base >= MIN_BASE);

/** A formatted change, or "— (low volume)" when its base is too small. */
export const changeText = (
  change: number | null,
  base: number,
  format: (value: number) => string,
): string => (change === null || isLowVolume(base) ? LOW_VOLUME : format(change));

export interface LastTwelve {
  current: number;
  prior: number;
  /** null when the previous 12 months are below MIN_BASE. */
  change: number | null;
  currentRange: MonthRange;
  priorRange: MonthRange;
}

/** The 12 months ending at the data's last month, the 12 before, and the change. Missing months count as 0. */
export function lastTwelve(rows: readonly Issued[], dataEnd: number): LastTwelve {
  const currentRange = { start: dataEnd - 11, end: dataEnd };
  const priorRange = { start: dataEnd - 23, end: dataEnd - 12 };
  const current = total(rows, (r) => r.monthIndex >= currentRange.start && r.monthIndex <= currentRange.end);
  const prior = total(rows, (r) => r.monthIndex >= priorRange.start && r.monthIndex <= priorRange.end);
  return { current, prior, change: changeVsBase(current, prior), currentRange, priorRange };
}

export interface Recovery {
  /** Latest complete year as % of 2019 (100 = 2019 level); null when 2019 is below MIN_BASE. */
  index: number | null;
  base2019: number;
  latest: number;
  year: number | null;
}

/** The latest complete year (from the coverage) against 2019. Only 2019 needs MIN_BASE, so collapses still show. */
export function recoveryVs2019(rows: readonly Issued[], year: number | null): Recovery {
  const base2019 = total(rows, (r) => r.year === 2019);
  const latest = year === null ? 0 : total(rows, (r) => r.year === year);
  const index = year !== null && !isLowVolume(base2019) ? (latest / base2019) * 100 : null;
  return { index, base2019, latest, year };
}

/* ------------------------------------------------------------------ *
 * Fix Pack A2: missing months count as 0; one typical-year peak
 * ------------------------------------------------------------------ */

/** Years left out of the typical year: COVID disrupted both. */
const ATYPICAL_YEARS = new Set([2020, 2021]);

/** Complete calendar years in the coverage except 2020–2021 (2018, 2019, 2022–2025 today). */
export function typicalYearsOf(coverage: MonthRange): number[] {
  const years: number[] = [];
  for (let year = Math.floor(coverage.start / 12); year <= Math.floor(coverage.end / 12); year += 1) {
    const complete = year * 12 >= coverage.start && year * 12 + 11 <= coverage.end;
    if (complete && !ATYPICAL_YEARS.has(year)) years.push(year);
  }
  return years;
}

/** One value per month from `range.start` to `range.end`; months with no rows are 0. */
export function monthlySeries(rows: readonly Issued[], range: MonthRange): number[] {
  const values = new Array<number>(Math.max(0, range.end - range.start + 1)).fill(0);
  for (const row of rows) {
    if (row.monthIndex >= range.start && row.monthIndex <= range.end) {
      values[row.monthIndex - range.start] += row.issuances;
    }
  }
  return values;
}

/** Total ÷ every month in the range (not only months with issuances). */
export function averagePerMonthIn(rows: readonly Issued[], range: MonthRange): number | null {
  const months = range.end - range.start + 1;
  return months > 0 ? monthlySeries(rows, range).reduce((a, b) => a + b, 0) / months : null;
}

/** Coefficient of variation (population SD ÷ mean); null with fewer than 2 values or a zero mean. */
function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return null;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Monthly volatility over the range, missing months as 0; null with no rows at all. */
export function volatilityIn(rows: readonly Issued[], range: MonthRange): number | null {
  return rows.length === 0 ? null : coefficientOfVariation(monthlySeries(rows, range));
}

/** CV of the per-calendar-month averages within the range (each month ÷ how often it occurs in the range). */
export function seasonalityCvIn(rows: readonly (Issued & { month: number })[], range: MonthRange): number | null {
  if (rows.length === 0) return null;
  const totals = new Array<number>(13).fill(0);
  const counts = new Array<number>(13).fill(0);
  for (let index = range.start; index <= range.end; index += 1) counts[(index % 12) + 1] += 1;
  for (const row of rows) {
    if (row.monthIndex >= range.start && row.monthIndex <= range.end) totals[row.month] += row.issuances;
  }
  const averages: number[] = [];
  for (let month = 1; month <= 12; month += 1) if (counts[month] > 0) averages.push(totals[month] / counts[month]);
  return coefficientOfVariation(averages);
}

/** Below this many visas in an average typical year, no peak month or seasonality is shown. */
export const PEAK_MIN_BASE = 100;

export interface TypicalYear {
  /** Average per calendar month, January first (12 values). */
  averages: number[];
  /** Sum of the 12 averages: an average typical year's total. */
  yearTotal: number;
  /** 1–12, or null when there are no visas or the year total is below PEAK_MIN_BASE. */
  peakMonth: number | null;
  /** Peak average ÷ mean month; null whenever peakMonth is. */
  seasonalityRatio: number | null;
  /** True when there are visas but too few for a meaningful peak ("— (low volume)"). */
  lowVolume: boolean;
}

/**
 * The typical year for one country, consulate or selection: the average per
 * calendar month over `years` (complete years except 2020–2021), missing
 * months as 0. Every page takes its peak month and seasonality from here.
 */
export function typicalYear(rows: readonly (Issued & { month: number })[], years: readonly number[]): TypicalYear {
  const included = new Set(years);
  const totals = new Array<number>(12).fill(0);
  for (const row of rows) if (included.has(row.year)) totals[row.month - 1] += row.issuances;
  const averages = totals.map((value) => (years.length > 0 ? value / years.length : 0));
  const yearTotal = averages.reduce((a, b) => a + b, 0);
  const peak = Math.max(...averages);
  if (yearTotal <= 0 || yearTotal < PEAK_MIN_BASE) {
    return { averages, yearTotal, peakMonth: null, seasonalityRatio: null, lowVolume: rows.length > 0 };
  }
  // Ties go to the earliest month.
  return {
    averages,
    yearTotal,
    peakMonth: averages.indexOf(peak) + 1,
    seasonalityRatio: peak / (yearTotal / 12),
    lowVolume: false,
  };
}

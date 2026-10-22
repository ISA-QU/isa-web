/**
 * Period helpers: provisional fiscal years, fiscal-year comparisons, and
 * per-calendar-month averages that don't over-count months with more years
 * of data.
 */

import { pctGrowth } from "./metrics";
import type { AnnualCountryRow, FiscalYearInfo, Visa } from "./types";

/**
 * Complete fiscal years summed from monthly reports rather than taken from the
 * official annual tables (FY2025 today). Their totals are provisional.
 */
export function provisionalFiscalYears(fiscalYears: readonly FiscalYearInfo[]): Set<number> {
  return new Set(
    fiscalYears.filter((f) => f.complete && f.source === "monthly").map((f) => f.fiscalYear),
  );
}

/** "FY2025 (provisional)" or "FY2024". */
export const fyLabel = (year: number, provisional: ReadonlySet<number>): string =>
  `FY${year}${provisional.has(year) ? " (provisional)" : ""}`;

/** One country's issuances for one visa class, by fiscal year. */
export function annualByYear(
  rows: readonly AnnualCountryRow[],
  country: string,
  visa: Visa,
): Map<number, number> {
  const byYear = new Map<number, number>();
  for (const row of rows) {
    if (row.country !== country || row.visa !== visa) continue;
    byYear.set(row.fiscalYear, (byYear.get(row.fiscalYear) ?? 0) + row.issuances);
  }
  return byYear;
}

/** % change from `baseYear` to `year`; null when either year is missing or the base is 0. */
export function fyChange(byYear: ReadonlyMap<number, number>, year: number, baseYear: number): number | null {
  const current = byYear.get(year);
  const base = byYear.get(baseYear);
  if (current === undefined || base === undefined) return null;
  return pctGrowth(current, base);
}

/**
 * For each calendar month (1-12), how many years in `rows` include that month.
 * Pass the whole filtered dataset, not one country's rows, so a month where a
 * country had no issuances still counts as a year of data.
 */
export function calendarMonthYearCounts(
  rows: readonly { year: number; month: number }[],
): Map<number, number> {
  const years = new Map<number, Set<number>>();
  for (const row of rows) {
    let set = years.get(row.month);
    if (!set) {
      set = new Set();
      years.set(row.month, set);
    }
    set.add(row.year);
  }
  return new Map([...years.entries()].map(([month, set]) => [month, set.size]));
}

/** `total / years with that month`, or 0 when the month has no data. */
export const averagePerMonth = (
  total: number,
  month: number,
  yearCounts: ReadonlyMap<number, number>,
): number => {
  const count = yearCounts.get(month) ?? 0;
  return count > 0 ? total / count : 0;
};

/** "2024–2026" for consecutive years, "2024, 2026" otherwise, "2025" for one. */
export function yearSpanLabel(years: readonly number[]): string {
  if (years.length === 0) return "no years";
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) return String(first);
  return last - first === sorted.length - 1 ? `${first}–${last}` : sorted.join(", ");
}

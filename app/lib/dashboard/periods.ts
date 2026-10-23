/**
 * Period helpers: provisional fiscal years, fiscal-year comparisons, and
 * per-calendar-month averages that don't over-count months with more years
 * of data.
 */

import { MONTH_NAMES } from "./constants";
import { typicalYearsOf } from "./measures";
import { pctGrowth } from "./metrics";
import type { AnnualCountryRow, FiscalYearInfo, MonthRange, Visa } from "./types";

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

/* ------------------------------------------------------------------ *
 * The control bar's Period (monthly consulate data)
 * ------------------------------------------------------------------ */

/** What the Period control can hold. Months are `year * 12 + (month - 1)` indexes. */
export type PeriodChoice =
  | { kind: "last12" }
  | { kind: "last24" }
  | { kind: "all" }
  | { kind: "pandemic" }
  | { kind: "year"; year: number }
  | { kind: "custom"; start: number; end: number };

export const DEFAULT_PERIOD: PeriodChoice = { kind: "last12" };

/** A period resolved against the data: the months it covers and how to label it. */
export interface ResolvedPeriod extends MonthRange {
  /** e.g. "Last 12 months (Mar 2025 – Feb 2026)", "2026 (Jan–Feb)". */
  label: string;
  /** The same, for use inside a sentence: "the last 12 months (Mar 2025 – Feb 2026)". */
  inSentence: string;
  /** For file names, e.g. "2025-03_2026-02". */
  slug: string;
}

const monthShort = (index: number) => `${MONTH_NAMES[(index % 12) + 1]} ${Math.floor(index / 12)}`;
const rangeText = (start: number, end: number) =>
  start === end ? monthShort(start) : `${monthShort(start)} – ${monthShort(end)}`;
const stamp = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

/** Years with data, each labelled "2024", or "2026 (Jan–Feb)" / "2017 (Mar–Dec)" when partial. */
export function calendarYearOptions(coverage: MonthRange): { year: number; label: string }[] {
  const first = Math.floor(coverage.start / 12);
  const last = Math.floor(coverage.end / 12);
  const options = [];
  for (let year = first; year <= last; year += 1) {
    options.push({ year, label: calendarYearLabel(year, coverage) });
  }
  return options;
}

export function calendarYearLabel(year: number, coverage: MonthRange): string {
  const start = Math.max(year * 12, coverage.start);
  const end = Math.min(year * 12 + 11, coverage.end);
  if (start === year * 12 && end === year * 12 + 11) return String(year);
  const from = MONTH_NAMES[(start % 12) + 1];
  const to = MONTH_NAMES[(end % 12) + 1];
  return `${year} (${from === to ? from : `${from}–${to}`})`;
}

/** The pre-pandemic-through-recovery preset: Jan 2019 – Dec 2022. */
const PANDEMIC_RANGE = { start: 2019 * 12, end: 2022 * 12 + 11 };

export function resolvePeriod(choice: PeriodChoice, coverage: MonthRange): ResolvedPeriod {
  const clamp = (start: number, end: number) => ({
    start: Math.max(start, coverage.start),
    end: Math.min(end, coverage.end),
  });
  let range: MonthRange;
  let label: string;
  switch (choice.kind) {
    case "last12":
      range = clamp(coverage.end - 11, coverage.end);
      label = `Last 12 months (${rangeText(range.start, range.end)})`;
      break;
    case "last24":
      range = clamp(coverage.end - 23, coverage.end);
      label = `Last 24 months (${rangeText(range.start, range.end)})`;
      break;
    case "all":
      range = { start: coverage.start, end: coverage.end };
      label = `All (since ${monthShort(coverage.start)})`;
      break;
    case "pandemic":
      range = clamp(PANDEMIC_RANGE.start, PANDEMIC_RANGE.end);
      label = `Pre-pandemic through recovery (${rangeText(range.start, range.end)})`;
      break;
    case "year":
      range = clamp(choice.year * 12, choice.year * 12 + 11);
      label = calendarYearLabel(choice.year, coverage);
      break;
    case "custom": {
      const start = Math.min(choice.start, choice.end);
      const end = Math.max(choice.start, choice.end);
      range = clamp(start, end);
      label = rangeText(range.start, range.end);
      break;
    }
  }
  // A period entirely outside the data: show all of it, labelled as such.
  if (range.start > range.end) return resolvePeriod({ kind: "all" }, coverage);
  const inSentence =
    choice.kind === "last12" || choice.kind === "last24" || choice.kind === "pandemic"
      ? `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`
      : choice.kind === "all"
        ? `all months since ${monthShort(coverage.start)}`
        : label;
  return { ...range, label, inSentence, slug: `${stamp(range.start)}_${stamp(range.end)}` };
}

/** The web-address form: last12, last24, all, pandemic, 2025, or 2023-01_2024-06. */
export function periodToParam(choice: PeriodChoice): string {
  switch (choice.kind) {
    case "year":
      return String(choice.year);
    case "custom":
      return `${stamp(choice.start)}_${stamp(choice.end)}`;
    default:
      return choice.kind;
  }
}

export function periodFromParam(param: string | null): PeriodChoice | null {
  if (!param) return null;
  if (param === "last12" || param === "last24" || param === "all" || param === "pandemic") {
    return { kind: param };
  }
  if (/^\d{4}$/.test(param)) return { kind: "year", year: Number(param) };
  const custom = /^(\d{4})-(\d{2})_(\d{4})-(\d{2})$/.exec(param);
  if (custom) {
    const validMonth = (m: string) => Number(m) >= 1 && Number(m) <= 12;
    if (!validMonth(custom[2]) || !validMonth(custom[4])) return null;
    const start = Number(custom[1]) * 12 + Number(custom[2]) - 1;
    const end = Number(custom[3]) * 12 + Number(custom[4]) - 1;
    return { kind: "custom", start, end };
  }
  return null;
}

/**
 * Whether a period read from a link overlaps the data at all. A year or range
 * entirely outside it (e.g. period=2010) is rejected, so the dashboard falls
 * back to the default instead of mislabelling the whole history.
 */
export function periodInCoverage(choice: PeriodChoice, coverage: MonthRange): boolean {
  switch (choice.kind) {
    case "year":
      return choice.year * 12 + 11 >= coverage.start && choice.year * 12 <= coverage.end;
    case "custom": {
      const start = Math.min(choice.start, choice.end);
      const end = Math.max(choice.start, choice.end);
      return end >= coverage.start && start <= coverage.end;
    }
    default:
      return true;
  }
}

/** A `period=` value checked against the data: null when unreadable or outside it. */
export function periodFromLink(param: string | null, coverage: MonthRange): PeriodChoice | null {
  const choice = periodFromParam(param);
  return choice && periodInCoverage(choice, coverage) ? choice : null;
}

/* ------------------------------------------------------------------ *
 * Typical year (seasonality baseline)
 * ------------------------------------------------------------------ */

/**
 * Complete calendar years in the monthly data, leaving out 2020 and 2021 (e.g.
 * 2018, 2019, 2022–2025). Seasonality charts average over these, whatever the
 * Period, so a partial or disrupted year can't distort the shape.
 */
export const typicalYears = (coverage: MonthRange): number[] => typicalYearsOf(coverage);

/** "2018, 2019, 2022–2025": consecutive runs joined with an en dash. */
export function yearListLabel(years: readonly number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : sorted.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return parts.join(", ");
}

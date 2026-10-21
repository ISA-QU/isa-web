/**
 * Rolling 12-month totals for the dashboard header.
 *
 * Reads the full monthly post (consulate) data, never the sidebar's
 * year-filtered rows, so the header always covers the latest 12 months and the
 * 12 before them. "Country" here is the country of the issuing consulate, not
 * the student's nationality.
 */

import { monthDisplay } from "./format";
import { pctGrowth } from "./metrics";
import type { MonthRange, PostMonthlyRow } from "./types";

const WINDOW = 12;

export interface RollingWindow extends MonthRange {
  /** Months in the range that have post data (12 when complete). */
  monthsPresent: number;
  complete: boolean;
  f1: number;
  j1: number;
  /** F1 issuances by issuing-consulate country. */
  f1ByCountry: Map<string, number>;
}

export interface RollingTwelveMonths {
  current: RollingWindow;
  prior: RollingWindow;
  /** % change in F1, current vs prior; null unless both windows are complete. */
  f1Change: number | null;
  /** % change in J1, current vs prior; null unless both windows are complete. */
  j1Change: number | null;
}

function emptyWindow(start: number, end: number): RollingWindow {
  return { start, end, monthsPresent: 0, complete: false, f1: 0, j1: 0, f1ByCountry: new Map() };
}

/** The 12 months ending at `endMonth` (a `year * 12 + (month - 1)` index), and the 12 before. */
export function rollingTwelveMonths(
  rows: readonly PostMonthlyRow[],
  endMonth: number,
): RollingTwelveMonths {
  const current = emptyWindow(endMonth - WINDOW + 1, endMonth);
  const prior = emptyWindow(endMonth - 2 * WINDOW + 1, endMonth - WINDOW);
  const seen = { current: new Set<number>(), prior: new Set<number>() };

  for (const row of rows) {
    const key =
      row.monthIndex >= current.start && row.monthIndex <= current.end
        ? "current"
        : row.monthIndex >= prior.start && row.monthIndex <= prior.end
          ? "prior"
          : null;
    if (key === null) continue;
    const window = key === "current" ? current : prior;
    seen[key].add(row.monthIndex);
    if (row.visa === "F1") {
      window.f1 += row.issuances;
      window.f1ByCountry.set(row.country, (window.f1ByCountry.get(row.country) ?? 0) + row.issuances);
    } else {
      window.j1 += row.issuances;
    }
  }

  for (const key of ["current", "prior"] as const) {
    const window = key === "current" ? current : prior;
    window.monthsPresent = seen[key].size;
    window.complete = window.monthsPresent === WINDOW;
  }

  const comparable = current.complete && prior.complete;
  return {
    current,
    prior,
    f1Change: comparable ? pctGrowth(current.f1, prior.f1) : null,
    j1Change: comparable ? pctGrowth(current.j1, prior.j1) : null,
  };
}

/** % change for one country's F1, current vs prior; null unless comparable. */
export function countryF1Change(rolling: RollingTwelveMonths, country: string): number | null {
  if (!rolling.current.complete || !rolling.prior.complete) return null;
  return pctGrowth(
    rolling.current.f1ByCountry.get(country) ?? 0,
    rolling.prior.f1ByCountry.get(country) ?? 0,
  );
}

/** "Mar 2025 – Feb 2026". */
export const monthRangeLabel = (range: MonthRange): string =>
  `${monthDisplay(range.start)} – ${monthDisplay(range.end)}`;

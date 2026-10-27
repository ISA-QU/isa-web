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

export interface RollingGroup {
  current: number;
  prior: number;
  /** % change, current vs prior; null when not comparable or the prior total is 0. */
  change: number | null;
}

/**
 * Latest-12 and previous-12 month totals per group (a post, a country, or one
 * key for a single total), over the same windows as `rollingTwelveMonths`.
 * Rows for which `keyOf` returns null are skipped, which doubles as a filter.
 */
export function rollingTotals<K>(
  rows: readonly PostMonthlyRow[],
  endMonth: number,
  keyOf: (row: PostMonthlyRow) => K | null,
): { groups: Map<K, RollingGroup>; current: MonthRange; prior: MonthRange; comparable: boolean } {
  const current = { start: endMonth - WINDOW + 1, end: endMonth };
  const prior = { start: endMonth - 2 * WINDOW + 1, end: endMonth - WINDOW };
  const groups = new Map<K, RollingGroup>();
  const currentMonths = new Set<number>();
  const priorMonths = new Set<number>();

  for (const row of rows) {
    const inCurrent = row.monthIndex >= current.start && row.monthIndex <= current.end;
    const inPrior = row.monthIndex >= prior.start && row.monthIndex <= prior.end;
    if (!inCurrent && !inPrior) continue;
    // Month coverage counts every row in the window, not only the selected ones,
    // so a group with no rows in some month still compares complete windows.
    (inCurrent ? currentMonths : priorMonths).add(row.monthIndex);
    const key = keyOf(row);
    if (key === null) continue;
    let group = groups.get(key);
    if (!group) {
      group = { current: 0, prior: 0, change: null };
      groups.set(key, group);
    }
    if (inCurrent) group.current += row.issuances;
    else group.prior += row.issuances;
  }

  const comparable = currentMonths.size === WINDOW && priorMonths.size === WINDOW;
  for (const group of groups.values()) {
    group.change = comparable ? pctGrowth(group.current, group.prior) : null;
  }
  return { groups, current, prior, comparable };
}

/** "▲ 4.2%" / "▼ 34.7%" / "0.0%"; "N/A" when there is no change. */
export function arrowPct(change: number | null): string {
  if (change === null || Number.isNaN(change)) return "N/A";
  if (change > 0) return `▲ ${change.toFixed(1)}%`;
  if (change < 0) return `▼ ${Math.abs(change).toFixed(1)}%`;
  return "0.0%";
}

/** Minimum issuances in BOTH 12-month windows for a row to count as a riser or faller. */
export const MOVER_MIN_ISSUANCES = 100;

/** Largest increases and largest decreases among groups that clear the minimum volume. */
export function risersAndFallers<K>(
  groups: Map<K, RollingGroup>,
  limit = 10,
  minimum = MOVER_MIN_ISSUANCES,
): { risers: Array<[K, RollingGroup]>; fallers: Array<[K, RollingGroup]>; qualifying: number } {
  const eligible = [...groups.entries()].filter(
    ([, g]) => g.change !== null && g.current >= minimum && g.prior >= minimum,
  );
  const risers = eligible
    .filter(([, g]) => g.change! > 0)
    .sort((a, b) => b[1].change! - a[1].change!)
    .slice(0, limit);
  const fallers = eligible
    .filter(([, g]) => g.change! < 0)
    .sort((a, b) => a[1].change! - b[1].change!)
    .slice(0, limit);
  return { risers, fallers, qualifying: eligible.length };
}

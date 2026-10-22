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

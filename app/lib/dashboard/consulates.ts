/**
 * Calculations for the Consulates page: a ranked table of consulates for a
 * scope (one country, or all) and a period, compared with the previous period
 * of equal length, plus recovery vs 2019 and the "where issued vs who
 * received" context line. Pure functions, so the verify script can check them.
 */

import { MONTH_NAMES } from "./constants";
import { groupSum, latestCompleteYear, pctGrowth, sumBy } from "./metrics";
import { MOVER_MIN_ISSUANCES } from "./rolling";
import type { MonthRange, NationalityMonthlyRow, PostMonthlyRow, Visa } from "./types";

/**
 * The period of equal length immediately before `range`, or null when it would
 * start before the data does (e.g. Period = All, or the 2019–2022 preset).
 */
export function previousPeriod(range: MonthRange, coverage: MonthRange): MonthRange | null {
  const length = range.end - range.start + 1;
  const prior = { start: range.start - length, end: range.start - 1 };
  return prior.start >= coverage.start ? prior : null;
}

/**
 * % change, or null ("—") when either side has fewer than 100 issuances: the
 * same qualifying rule as risers and fallers, so tiny volumes can't produce
 * misleading percentages.
 */
export function qualifiedChange(current: number, prior: number | null): number | null {
  if (prior === null || current < MOVER_MIN_ISSUANCES || prior < MOVER_MIN_ISSUANCES) return null;
  return pctGrowth(current, prior);
}

/** Latest complete calendar year vs 2019 (100 = 2019 level); null below 100 issuances either year. */
export function recoveryVs2019(rows: readonly PostMonthlyRow[], year: number | null): number | null {
  if (year === null) return null;
  const latest = sumBy(rows.filter((r) => r.year === year), (r) => r.issuances);
  const base = sumBy(rows.filter((r) => r.year === 2019), (r) => r.issuances);
  if (latest < MOVER_MIN_ISSUANCES || base < MOVER_MIN_ISSUANCES) return null;
  return (latest / base) * 100;
}

export interface ConsulateRow {
  post: string;
  country: string;
  /** Issuances in the period. */
  volume: number;
  /** Issuances in the previous equal-length period (null when there is none). */
  prior: number | null;
  change: number | null;
  /** Share of the scope's total in the period, 0–100. */
  share: number;
  /** Share of its own country's total in the period, 0–100. */
  countryShare: number;
  recovery: number | null;
}

/**
 * Ranked consulates for a scope: `country` = consulates located in that
 * country, null = all. `rows` must already be limited to the selected visas.
 * `recoveryYear` is the latest complete calendar year in the data.
 */
export function buildConsulateTable(
  rows: readonly PostMonthlyRow[],
  range: MonthRange,
  prior: MonthRange | null,
  country: string | null,
  recoveryYear: number | null,
): ConsulateRow[] {
  const inRange = (r: PostMonthlyRow, span: MonthRange) =>
    r.monthIndex >= span.start && r.monthIndex <= span.end;
  const scoped = country === null ? rows : rows.filter((r) => r.country === country);
  const current = scoped.filter((r) => inRange(r, range));
  const volume = groupSum(current, (r) => r.post, (r) => r.issuances);
  const before = prior
    ? groupSum(scoped.filter((r) => inRange(r, prior)), (r) => r.post, (r) => r.issuances)
    : null;
  const countryOf = new Map(current.map((r) => [r.post, r.country]));
  const byCountry = groupSum(current, (r) => r.country, (r) => r.issuances);
  const total = sumBy(current, (r) => r.issuances);
  const history = new Map<string, PostMonthlyRow[]>();
  for (const row of scoped) {
    const list = history.get(row.post);
    if (list) list.push(row);
    else history.set(row.post, [row]);
  }

  return [...volume.entries()]
    .map(([post, value]) => {
      const postCountry = countryOf.get(post) ?? "";
      const priorValue = before ? (before.get(post) ?? 0) : null;
      const countryTotal = byCountry.get(postCountry) ?? 0;
      return {
        post,
        country: postCountry,
        volume: value,
        prior: priorValue,
        change: qualifiedChange(value, priorValue),
        share: total > 0 ? (value / total) * 100 : 0,
        countryShare: countryTotal > 0 ? (value / countryTotal) * 100 : 0,
        recovery: recoveryVs2019(history.get(post) ?? [], recoveryYear),
      };
    })
    .sort((a, b) => b.volume - a.volume || a.post.localeCompare(b.post));
}

/** The latest complete calendar year in the monthly data (2025 today). */
export const recoveryYearOf = (rows: readonly PostMonthlyRow[]): number | null => latestCompleteYear(rows);

/**
 * The context line's two counts for one country and period: visas issued by
 * consulates located in the country, and visas received by its citizens
 * worldwide. Null when the nationality table is missing or has no rows for the
 * country, so the line is hidden.
 */
export function consulateContext(
  posts: readonly PostMonthlyRow[],
  nationality: readonly NationalityMonthlyRow[] | null,
  country: string,
  range: MonthRange,
  visas: readonly Visa[],
): { issuedIn: number; receivedBy: number } | null {
  if (!nationality) return null;
  const inRange = (index: number) => index >= range.start && index <= range.end;
  const citizens = nationality.filter((r) => r.isCountry && r.country === country);
  if (citizens.length === 0) return null;
  return {
    issuedIn: sumBy(
      posts.filter((r) => r.country === country && visas.includes(r.visa) && inRange(r.monthIndex)),
      (r) => r.issuances,
    ),
    receivedBy: sumBy(
      citizens.filter((r) => visas.includes(r.visa) && inRange(r.monthIndex)),
      (r) => r.issuances,
    ),
  };
}

/** "Jan–Feb": the months of the latest (partial) year so far, from the data. Null when the year is complete. */
export function sameMonthsLabel(coverageEnd: number): string | null {
  const throughMonth = (coverageEnd % 12) + 1;
  if (throughMonth === 12) return null;
  return throughMonth === 1 ? MONTH_NAMES[1] : `${MONTH_NAMES[1]}–${MONTH_NAMES[throughMonth]}`;
}

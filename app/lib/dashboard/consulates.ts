/**
 * Calculations for the Consulates page: a ranked table of consulates for a
 * scope (one country, or all) and a period, compared with the previous period
 * of equal length, plus recovery vs 2019 and the "where issued vs who
 * received" context line. Pure functions, so the verify script can check them.
 */

import { MONTH_NAMES } from "./constants";
import { monthDisplay } from "./format";
import { changeVsBase, latestCompleteYearOf, recoveryVs2019 as recoveryOf } from "./measures";
import { groupSum, sumBy } from "./metrics";
import type { ConsulateStatus } from "./restrictions";
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
 * % change, or null: "—" when there is no previous period, "— (low volume)"
 * when the previous period has fewer than 100 issuances. Only the earlier side
 * needs 100, so a big drop to almost nothing still shows.
 */
export function qualifiedChange(current: number, prior: number | null): number | null {
  if (prior === null) return null;
  return changeVsBase(current, prior);
}

/** Latest complete year vs 2019 (100 = 2019 level); null ("— (low volume)") when 2019 had fewer than 100. */
export function recoveryVs2019(rows: readonly PostMonthlyRow[], year: number | null): number | null {
  return recoveryOf(rows, year).index;
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

/** The latest complete calendar year in the monthly data's coverage (2025 today), the same for every consulate. */
export const recoveryYearOf = (coverage: MonthRange): number | null => latestCompleteYearOf(coverage);

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

/**
 * Whether consulates in `country` issue visas today: F1 or J1 in the 12 months
 * ending at the data's last month (whatever the Period and Visa controls say).
 * `rows` is every consulate row (both visa classes).
 */
export function consulateStatus(rows: readonly PostMonthlyRow[], country: string, dataEnd: number): ConsulateStatus {
  const own = rows.filter((r) => r.country === country && r.issuances > 0);
  if (own.length === 0) return "no-consulate";
  return own.some((r) => r.monthIndex > dataEnd - 12 && r.monthIndex <= dataEnd) ? "issuing" : "not-issuing";
}

export interface DormantConsulate extends ConsulateRow {
  /** Last month with the selected visas at this consulate; null when it never issued them in the data. */
  lastIssuance: number | null;
  /** Last month with F1 or J1 at this consulate. */
  lastAnyIssuance: number;
}

/**
 * Every consulate that has ever issued F1 or J1 in `country`, with 0 for the
 * Period, for a country whose consulates issued none of the selected visas in
 * it. `selected` is limited to the selected visas; `all` has both classes.
 * Change and recovery follow the same rules as the ranked table. Most recent
 * last issuance first.
 */
export function dormantConsulates(
  selected: readonly PostMonthlyRow[],
  all: readonly PostMonthlyRow[],
  range: MonthRange,
  prior: MonthRange | null,
  country: string,
  recoveryYear: number | null,
): DormantConsulate[] {
  const own = all.filter((r) => r.country === country && r.issuances > 0);
  const posts = [...new Set(own.map((r) => r.post))];
  const inSpan = (span: MonthRange) => (r: PostMonthlyRow) => r.monthIndex >= span.start && r.monthIndex <= span.end;
  return posts
    .map((post) => {
      const mine = selected.filter((r) => r.post === post && r.country === country && r.issuances > 0);
      const volume = sumBy(mine.filter(inSpan(range)), (r) => r.issuances);
      const priorValue = prior ? sumBy(mine.filter(inSpan(prior)), (r) => r.issuances) : null;
      return {
        post,
        country,
        volume,
        prior: priorValue,
        change: qualifiedChange(volume, priorValue),
        share: 0,
        countryShare: 0,
        recovery: recoveryVs2019(mine, recoveryYear),
        lastIssuance: mine.length > 0 ? Math.max(...mine.map((r) => r.monthIndex)) : null,
        lastAnyIssuance: Math.max(...own.filter((r) => r.post === post).map((r) => r.monthIndex)),
      };
    })
    .sort(
      (a, b) =>
        (b.lastIssuance ?? -1) - (a.lastIssuance ?? -1) ||
        b.lastAnyIssuance - a.lastAnyIssuance ||
        a.post.localeCompare(b.post),
    );
}

/** "Aug 2021", or "None (J1: Mar 2025)" for a consulate that never issued the selected visas. */
export function lastIssuanceText(row: DormantConsulate, otherVisa: string | null): string {
  if (row.lastIssuance !== null) return monthDisplay(row.lastIssuance);
  return otherVisa ? `None (${otherVisa}: ${monthDisplay(row.lastAnyIssuance)})` : "None";
}

/**
 * The line at the top of Consulates for a country with no visas in the Period:
 * "No U.S. F1 visas have been issued in Afghanistan since Aug 2021." Names the
 * visa class because the data has F1 and J1 only. With a single visa class
 * selected, adds when the other class was last issued if that is later.
 */
export function noIssuanceNotice(
  rows: readonly DormantConsulate[],
  country: string,
  visas: readonly Visa[],
  range: MonthRange & { inSentence: string },
  coverageStart: number,
): string {
  const label = visas.length === 2 ? "F1 or J1" : visas[0];
  const lastSelected = rows.reduce<number | null>(
    (best, r) => (r.lastIssuance !== null && (best === null || r.lastIssuance > best) ? r.lastIssuance : best),
    null,
  );
  const lastAny = Math.max(...rows.map((r) => r.lastAnyIssuance));
  const first =
    lastSelected === null
      ? `No U.S. ${label} visas have been issued in ${country} in this data (since ${monthDisplay(coverageStart)}).`
      : lastSelected < range.start
        ? `No U.S. ${label} visas have been issued in ${country} since ${monthDisplay(lastSelected)}.`
        : `No U.S. ${label} visas were issued in ${country} in ${range.inSentence}.`;
  const other = visas.length === 1 ? (visas[0] === "F1" ? "J1" : "F1") : null;
  return other && (lastSelected === null || lastAny > lastSelected)
    ? `${first} The last ${other} visa there was issued in ${monthDisplay(lastAny)}.`
    : first;
}

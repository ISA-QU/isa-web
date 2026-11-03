/**
 * The Markets table's rows (8-3), moved out of MarketsTab.tsx unchanged so the
 * page and the Bobcat's list_markets tool build the same rows from the same
 * code. Pure, so the verify script can check them.
 *
 * One row per country by nationality (nationalitySignals, the same rows as
 * Country 360's "What to do"), or by the country where visas were issued when
 * the snapshot has no nationality table.
 */

import { tenYearTrendText, trendCellText } from "./country360";
import { declineHistories, historyLabel, shownAction, type DeclineHistory, type HistoryLabel } from "./cycles";
import { changeText, changeVsBase } from "./measures";
import { buildCommandCenterFrame, historicalCountryName, monthlyCountryName, nationalitySignals } from "./metrics";
import { arrowPct } from "./rolling";
import { sortBy } from "./sort";
import type { AnnualCountryRow, CommandCenterRow, DashboardData, MonthRange, Visa, VisaSelection } from "./types";

/** How the main table is sorted. */
export const SORTS = ["Nationals", "Change", "10-year trend"] as const;
export type SortKey = (typeof SORTS)[number];

/** A market row: the shared nationality row (or the issued-in fallback) plus its Period figures. */
export type MarketRow = CommandCenterRow & {
  hideTiming?: boolean;
  periodTotal: number;
  periodPrior: number | null;
  periodChange: number | null;
};

/** Every country in either data source (consulate and nationality): the Country control's list. */
export const controlCountries = (data: DashboardData): string[] =>
  [...new Set([...data.postsMonthly.map((r) => r.country), ...data.annualCountry.map((r) => r.country)])].sort();

/** One row per country: the shared rules, nothing computed separately. */
export function marketSignals(data: DashboardData, visa: VisaSelection, allCountries: readonly string[]): CommandCenterRow[] {
  const { coverage } = data.meta;
  const nationality = data.nationalityMonthly;
  if (nationality) {
    const control = new Set(allCountries);
    const countries = [...new Set(nationality.filter((r) => r.isCountry && control.has(r.country)).map((r) => r.country))];
    return countries
      .map((c) =>
        nationalitySignals(
          nationality,
          data.annualCountry,
          c,
          visa,
          coverage.annual.latestComplete,
          coverage.postsMonthly,
          coverage.operational,
        ),
      )
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }
  return buildCommandCenterFrame(
    data.operational,
    data.annualCountry,
    data.postsMonthly,
    visa,
    coverage.annual.latestComplete,
    coverage.postsMonthly,
  );
}

/** The Period columns: nationals in the Period and the change vs the previous period of equal length. */
export function marketRows(
  signals: readonly CommandCenterRow[],
  data: DashboardData,
  visa: VisaSelection,
  periodRange: MonthRange,
  priorRange: MonthRange | null,
): MarketRow[] {
  const visas: string[] = visa === "Both" ? ["F1", "J1"] : [visa];
  const nationality = data.nationalityMonthly;
  const now = new Map<string, number>();
  const before = new Map<string, number>();
  const source: readonly { country: string; visa: string; monthIndex: number; issuances: number }[] =
    nationality ? nationality.filter((r) => r.isCountry) : data.postsMonthly;
  for (const r of source) {
    if (!visas.includes(r.visa)) continue;
    if (r.monthIndex >= periodRange.start && r.monthIndex <= periodRange.end) {
      now.set(r.country, (now.get(r.country) ?? 0) + r.issuances);
    } else if (priorRange && r.monthIndex >= priorRange.start && r.monthIndex <= priorRange.end) {
      before.set(r.country, (before.get(r.country) ?? 0) + r.issuances);
    }
  }
  return signals.map((r) => {
    const periodTotal = now.get(r.country) ?? 0;
    const periodPrior = priorRange ? (before.get(r.country) ?? 0) : null;
    return {
      ...r,
      periodTotal,
      periodPrior,
      periodChange: periodPrior === null ? null : changeVsBase(periodTotal, periodPrior),
    };
  });
}

/** Region and minimum first (the category counts use these). */
export const marketsInScope = (
  rows: readonly MarketRow[],
  minNationals: number,
  region: string,
): MarketRow[] => rows.filter((r) => r.latest12Total >= minNationals && (region === "All" || r.region === region));

/** The category filter, then the table's sort. */
export function sortMarkets(inScope: readonly MarketRow[], category: string, sort: SortKey): MarketRow[] {
  const scoped = category === "All" ? inScope : inScope.filter((r) => r.marketCategory === category);
  if (sort === "Change") return sortBy(scoped, [(r) => r.periodChange, (r) => r.periodTotal]);
  if (sort === "10-year trend") return sortBy(scoped, [(r) => r.growth10yr, (r) => r.periodTotal]);
  return sortBy(scoped, [(r) => r.periodTotal, (r) => r.latest12Total]);
}

/** The Period change cell: "—" with no previous period, "— (low volume)" under 100, else "▼ 59.6%". */
export const marketChangeText = (r: MarketRow): string =>
  r.periodPrior === null ? "—" : changeText(r.periodChange, r.periodPrior, arrowPct);

/** Annual rows by country, for the trend cells. */
export function annualRowsByCountry(rows: readonly AnnualCountryRow[]): Map<string, AnnualCountryRow[]> {
  const byCountry = new Map<string, AnnualCountryRow[]>();
  for (const r of rows) {
    const list = byCountry.get(r.country);
    if (list) list.push(r);
    else byCountry.set(r.country, [r]);
  }
  return byCountry;
}

/** The "10-year trend" cell (Fix pack 10: FY base under 100 → low volume). */
export const marketTenYearText = (
  r: MarketRow,
  annualByCountry: ReadonlyMap<string, readonly AnnualCountryRow[]>,
  visas: readonly Visa[],
  latestFy: number | null,
): string => tenYearTrendText(r.growth10yr, annualByCountry.get(historicalCountryName(r.country)) ?? [], visas, latestFy);

/** The "5-year trend" cell (Fix pack 11). */
export const marketFiveYearText = (
  r: MarketRow,
  annualByCountry: ReadonlyMap<string, readonly AnnualCountryRow[]>,
  visas: readonly Visa[],
  latestFy: number | null,
): string => trendCellText(r.growth5yr, annualByCountry.get(historicalCountryName(r.country)) ?? [], visas, latestFy, 5);

/** Each country's F1 decline history over the data's complete fiscal years (Markets' action wording and history labels). */
export const marketHistories = (data: DashboardData): Map<string, DeclineHistory> => {
  const first = data.meta.coverage.annual.first;
  const latestFy = data.meta.coverage.annual.latestComplete;
  return declineHistories(data.annualCountry, first ?? 1997, latestFy ?? first ?? 1997);
};

/** "Review Structural Decline" worded by the country's F1 history (Fix pack 10). */
export const marketActionText = (r: CommandCenterRow, histories: ReadonlyMap<string, DeclineHistory>): string =>
  shownAction(r.recommendedAction, histories.get(historicalCountryName(r.country)) ?? null);

/** The "Action (category)" cell as text: restricted and restored advice already starts with its category. */
export const marketActionCellText = (r: CommandCenterRow, histories: ReadonlyMap<string, DeclineHistory>): string =>
  r.recommendedAction.startsWith(`${r.marketCategory} `) ? r.recommendedAction : `${marketActionText(r, histories)} (${r.marketCategory})`;

const NO_HISTORY: HistoryLabel = { kind: "no-visas", label: "No F1 visas in the annual data.", short: "—", evidence: "" };

/** 2b-2: the history label (background only), from the same F1 history as the action wording. */
export function marketHistory(
  country: string,
  histories: ReadonlyMap<string, DeclineHistory>,
  provisional: ReadonlySet<number>,
): HistoryLabel {
  const h = histories.get(historicalCountryName(country));
  return h ? historyLabel(h, provisional) : NO_HISTORY;
}

/**
 * Country 360's "What to do" row for one country: by nationality when possible,
 * otherwise the issued-in Command Center row for that country (null with neither).
 */
export function countrySignalRow(data: DashboardData, country: string, visa: VisaSelection): CommandCenterRow | null {
  const { coverage } = data.meta;
  const nationalityRow = nationalitySignals(
    data.nationalityMonthly,
    data.annualCountry,
    country,
    visa,
    coverage.annual.latestComplete,
    coverage.postsMonthly,
    coverage.operational,
  );
  return (
    nationalityRow ??
    buildCommandCenterFrame(
      data.operational,
      data.annualCountry,
      data.postsMonthly,
      visa,
      coverage.annual.latestComplete,
      coverage.postsMonthly,
      [monthlyCountryName(country)],
    )[0] ??
    null
  );
}

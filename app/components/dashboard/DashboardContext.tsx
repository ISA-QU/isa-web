"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { splitVisa } from "../../lib/dashboard/data";
import {
  buildCountrySummary,
  buildHistoricalMetricsFromAnnual,
  comparableGrowthLabel,
  groupSum,
  idxMaxNumeric,
  idxMaxString,
  marketTier,
  opportunityScore,
  seasonalityCv,
  sumBy,
  yoyGrowth,
} from "../../lib/dashboard/metrics";
import type {
  CountrySummaryRow,
  DashboardData,
  HistoricalMetricRow,
  OperationalRow,
  VisaSelection,
} from "../../lib/dashboard/types";
import {
  DEFAULT_PERIOD,
  provisionalFiscalYears,
  resolvePeriod,
  typicalYears,
  yearListLabel,
  type PeriodChoice,
  type ResolvedPeriod,
} from "../../lib/dashboard/periods";

/**
 * Holds every value app.py computed at module scope before rendering its tabs:
 * the three data layers, the sidebar filter state, and the focus-country
 * rollup derived from both.
 */
interface DashboardState {
  data: DashboardData;

  /** The control bar's Period (monthly consulate data) and its resolved months and label. */
  period: PeriodChoice;
  setPeriod: (period: PeriodChoice) => void;
  periodRange: ResolvedPeriod;
  /** The fiscal-year range Historical Trends uses (shown in the bar's Period slot there). */
  fyRange: { start: number; end: number };
  setFyRange: (range: { start: number; end: number }) => void;
  /** First fiscal year and latest complete fiscal year in the nationality data. */
  fyBounds: { first: number; latest: number };
  /** Complete fiscal years summed from monthly reports (FY2025 today). */
  provisionalYears: ReadonlySet<number>;
  focusCountry: string;
  setFocusCountry: (country: string) => void;
  /** The control bar's visa: F1, J1 or Both (shown as "F1 + J1"). */
  visa: VisaSelection;
  setVisa: (visa: VisaSelection) => void;
  /** "F1", "J1" or "F1 + J1", for chart titles. */
  visaLabel: string;
  /**
   * Country Intelligence's comparison. `null` means the default: the top five
   * markets by F1 in the selected Period.
   */
  compareCountries: string[] | null;
  setCompareCountries: (countries: string[] | null) => void;
  topN: number;
  setTopN: (topN: number) => void;

  /** Options derived from the data. */
  countries: string[];
  /**
   * Every country in either data source (consulate and nationality), for the
   * one shared country picker used by the sidebar and every tab.
   */
  allCountries: string[];
  /** Countries present in the monthly consulate data. */
  consulateCountries: ReadonlySet<string>;
  /** Countries present in the annual nationality data. */
  nationalityCountries: ReadonlySet<string>;

  /**
   * Unfiltered operational splits (Jan 2024 onward), and the Period-filtered
   * monthly consulate rows the tabs use (any months since Mar 2017).
   */
  f1: OperationalRow[];
  j1: OperationalRow[];
  f1Filtered: OperationalRow[];
  j1Filtered: OperationalRow[];
  dfFiltered: OperationalRow[];
  /** The Period-filtered rows for the control bar's visa. */
  visaFiltered: OperationalRow[];
  /** `visaFiltered` for the focus country. */
  focusRows: OperationalRow[];
  /**
   * The seasonality baseline: complete calendar years except 2020–2021, for the
   * control bar's visa, whatever the Period.
   */
  typical: { years: number[]; label: string; rows: OperationalRow[] };

  summary: CountrySummaryRow[];
  historicalMetrics: HistoricalMetricRow[];

  /** What `yoyGrowth` compares over `f1Filtered` (header KPIs, focus country). */
  growthLabel: string;
  /** The same for `summary`, which is built from the unfiltered F1 rows. */
  summaryGrowthLabel: string;

  /** Focus-country rollup (the `c_*` variables in app.py). */
  focus: {
    f1: OperationalRow[];
    j1: OperationalRow[];
    total: number;
    j1Total: number;
    posts: number;
    growth: number | null;
    cv: number | null;
    tier: string;
    opportunity: number;
    topPost: string;
    peakMonth: number;
  };
}

const DashboardContext = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return context;
}

/** Starting values read from the web address. */
export interface InitialSelection {
  country?: string;
  visa?: VisaSelection;
  period?: PeriodChoice;
}

export const DEFAULT_COUNTRY = "India";
export const DEFAULT_VISA: VisaSelection = "F1";

export const visaLabelOf = (visa: VisaSelection): string => (visa === "Both" ? "F1 + J1" : visa);

export function DashboardProvider({
  data,
  initial,
  children,
}: {
  data: DashboardData;
  initial?: InitialSelection;
  children: ReactNode;
}) {
  const { f1, j1 } = useMemo(() => splitVisa(data.operational), [data.operational]);

  const countries = useMemo(
    () => [...new Set(f1.map((r) => r.country))].sort(),
    [f1],
  );

  const consulateCountries = useMemo(
    () => new Set(data.postsMonthly.map((r) => r.country)),
    [data.postsMonthly],
  );
  const nationalityCountries = useMemo(
    () => new Set(data.annualCountry.map((r) => r.country)),
    [data.annualCountry],
  );
  // Names already match across the two sources (the rebuild Lambda unifies them).
  const allCountries = useMemo(
    () => [...new Set([...consulateCountries, ...nationalityCountries])].sort(),
    [consulateCountries, nationalityCountries],
  );

  const [selectedFocus, setFocusCountry] = useState<string>(() =>
    initial?.country && allCountries.includes(initial.country)
      ? initial.country
      : allCountries.includes(DEFAULT_COUNTRY)
        ? DEFAULT_COUNTRY
        : (allCountries[0] ?? ""),
  );
  const [visa, setVisa] = useState<VisaSelection>(initial?.visa ?? DEFAULT_VISA);
  const [period, setPeriod] = useState<PeriodChoice>(initial?.period ?? DEFAULT_PERIOD);
  const coverage = data.meta.coverage.postsMonthly;
  const periodRange = useMemo(
    () => resolvePeriod(period, coverage),
    [period, coverage],
  );

  const fyBounds = useMemo(() => {
    const first = data.meta.coverage.annual.first ?? 1997;
    return { first, latest: data.meta.coverage.annual.latestComplete ?? first };
  }, [data.meta.coverage.annual]);
  const [fyRange, setFyRange] = useState(() => ({ start: fyBounds.first, end: fyBounds.latest }));
  const provisionalYears = useMemo(
    () => provisionalFiscalYears(data.meta.fiscalYears),
    [data.meta.fiscalYears],
  );
  const [compareCountries, setCompareCountries] = useState<string[] | null>(null);
  const [topN, setTopN] = useState(25);

  // Resolved during render rather than corrected in an effect, so a dataset swap
  // never leaves a stale country selected for a frame.
  const focusCountry =
    allCountries.length === 0 || allCountries.includes(selectedFocus)
      ? selectedFocus
      : (allCountries.includes("India") ? "India" : allCountries[0]);

  // The Period can reach back to Mar 2017, so these come from the full monthly
  // consulate data, not the operational layer (which starts Jan 2024).
  const dfFiltered = useMemo(
    () =>
      data.postsMonthly.filter(
        (r) => r.monthIndex >= periodRange.start && r.monthIndex <= periodRange.end,
      ),
    [data.postsMonthly, periodRange],
  );
  const f1Filtered = useMemo(() => dfFiltered.filter((r) => r.visa === "F1"), [dfFiltered]);
  const j1Filtered = useMemo(() => dfFiltered.filter((r) => r.visa === "J1"), [dfFiltered]);

  // Charts that follow the control bar's visa read these.
  const visaFiltered = visa === "F1" ? f1Filtered : visa === "J1" ? j1Filtered : dfFiltered;
  const focusRows = useMemo(
    () => visaFiltered.filter((r) => r.country === focusCountry),
    [visaFiltered, focusCountry],
  );

  const typical = useMemo(() => {
    const years = typicalYears(coverage);
    const yearSet = new Set(years);
    const visas = visa === "Both" ? ["F1", "J1"] : [visa];
    return {
      years,
      label: yearListLabel(years),
      rows: data.postsMonthly.filter((r) => yearSet.has(r.year) && visas.includes(r.visa)),
    };
  }, [coverage, visa, data.postsMonthly]);

  // Built from the unfiltered splits, exactly as app.py does.
  const summary = useMemo(
    () => buildCountrySummary(f1, j1, data.countryCoords),
    [f1, j1, data.countryCoords],
  );

  const historicalMetrics = useMemo(
    () =>
      buildHistoricalMetricsFromAnnual(data.annualCountry, data.meta.coverage.annual.latestComplete),
    [data.annualCountry, data.meta],
  );

  const growthLabel = useMemo(() => comparableGrowthLabel(f1Filtered), [f1Filtered]);
  const summaryGrowthLabel = useMemo(() => comparableGrowthLabel(f1), [f1]);

  const focus = useMemo(() => {
    const cf1 = f1Filtered.filter((r) => r.country === focusCountry);
    const cj1 = j1Filtered.filter((r) => r.country === focusCountry);
    const total = sumBy(cf1, (r) => r.issuances);
    const growth = yoyGrowth(cf1);
    const cv = seasonalityCv(cf1);
    const postTotals = groupSum(cf1, (r) => r.post, (r) => r.issuances);
    const monthTotals = groupSum(cf1, (r) => r.month, (r) => r.issuances);

    return {
      f1: cf1,
      j1: cj1,
      total,
      j1Total: sumBy(cj1, (r) => r.issuances),
      posts: new Set(cf1.map((r) => r.post)).size,
      growth,
      cv,
      tier: marketTier(total),
      opportunity: opportunityScore(total, growth, cv),
      topPost: cf1.length > 0 ? (idxMaxString(postTotals) ?? "N/A") : "N/A",
      peakMonth: cf1.length > 0 ? (idxMaxNumeric(monthTotals) ?? 0) : 0,
    };
  }, [f1Filtered, j1Filtered, focusCountry]);

  const value: DashboardState = {
    data,
    period,
    setPeriod,
    periodRange,
    fyRange,
    setFyRange,
    fyBounds,
    provisionalYears,
    focusCountry,
    setFocusCountry,
    visa,
    setVisa,
    visaLabel: visaLabelOf(visa),
    compareCountries,
    setCompareCountries,
    topN,
    setTopN,
    countries,
    allCountries,
    consulateCountries,
    nationalityCountries,
    f1,
    j1,
    f1Filtered,
    j1Filtered,
    dfFiltered,
    visaFiltered,
    focusRows,
    typical,
    summary,
    historicalMetrics,
    growthLabel,
    summaryGrowthLabel,
    focus,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

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
} from "../../lib/dashboard/types";

/**
 * Holds every value app.py computed at module scope before rendering its tabs:
 * the three data layers, the sidebar filter state, and the focus-country
 * rollup derived from both.
 */
interface DashboardState {
  data: DashboardData;

  /** Sidebar filters. */
  selectedYears: number[];
  setSelectedYears: (years: number[]) => void;
  focusCountry: string;
  setFocusCountry: (country: string) => void;
  compareCountries: string[];
  setCompareCountries: (countries: string[]) => void;
  topN: number;
  setTopN: (topN: number) => void;

  /** Options derived from the data. */
  allYears: number[];
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

  /** Unfiltered operational splits, and the year-filtered views the tabs use. */
  f1: OperationalRow[];
  j1: OperationalRow[];
  f1Filtered: OperationalRow[];
  j1Filtered: OperationalRow[];
  dfFiltered: OperationalRow[];

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

export function DashboardProvider({
  data,
  children,
}: {
  data: DashboardData;
  children: ReactNode;
}) {
  const { f1, j1 } = useMemo(() => splitVisa(data.operational), [data.operational]);

  const allYears = useMemo(
    () => [...new Set(data.operational.map((r) => r.year))].sort((a, b) => a - b),
    [data.operational],
  );
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

  const [selectedYears, setSelectedYears] = useState<number[]>(allYears);
  const [selectedFocus, setFocusCountry] = useState<string>(() =>
    allCountries.includes("India") ? "India" : (allCountries[0] ?? ""),
  );
  const [compareCountries, setCompareCountries] = useState<string[]>(() =>
    ["India", "China", "Vietnam", "Nepal", "Nigeria"].filter((c) => countries.includes(c)),
  );
  const [topN, setTopN] = useState(25);

  // Resolved during render rather than corrected in an effect, so a dataset swap
  // never leaves a stale country selected for a frame.
  const focusCountry =
    allCountries.length === 0 || allCountries.includes(selectedFocus)
      ? selectedFocus
      : (allCountries.includes("India") ? "India" : allCountries[0]);

  const yearSet = useMemo(() => new Set(selectedYears), [selectedYears]);
  const hasYearFilter = selectedYears.length > 0;

  const f1Filtered = useMemo(
    () => (hasYearFilter ? f1.filter((r) => yearSet.has(r.year)) : f1),
    [f1, yearSet, hasYearFilter],
  );
  const j1Filtered = useMemo(
    () => (hasYearFilter ? j1.filter((r) => yearSet.has(r.year)) : j1),
    [j1, yearSet, hasYearFilter],
  );
  const dfFiltered = useMemo(
    () =>
      hasYearFilter
        ? data.operational.filter((r) => yearSet.has(r.year))
        : data.operational,
    [data.operational, yearSet, hasYearFilter],
  );

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
    selectedYears,
    setSelectedYears,
    focusCountry,
    setFocusCountry,
    compareCountries,
    setCompareCountries,
    topN,
    setTopN,
    allYears,
    countries,
    allCountries,
    consulateCountries,
    nationalityCountries,
    f1,
    j1,
    f1Filtered,
    j1Filtered,
    dfFiltered,
    summary,
    historicalMetrics,
    growthLabel,
    summaryGrowthLabel,
    focus,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

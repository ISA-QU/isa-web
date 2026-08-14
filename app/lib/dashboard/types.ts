export type Visa = "F1" | "J1";

/** "F1" | "J1" | "Both" — the visa selector used across every tab. */
export type VisaSelection = Visa | "Both";

/** Operational layer: monthly by post, Jan 2023 - Sep 2025. */
export interface OperationalRow {
  post: string;
  country: string;
  visa: Visa;
  year: number;
  month: number;
  issuances: number;
}

/** Annual country/nationality history, FY1997 - FY2024. */
export interface AnnualCountryRow {
  fiscalYear: number;
  country: string;
  visa: Visa;
  issuances: number;
}

/** Monthly consulate history, Mar 2017 - Sep 2025. */
export interface PostMonthlyRow {
  year: number;
  month: number;
  fiscalYear: number;
  post: string;
  /** Post name exactly as published, before canonicalisation. */
  postRaw: string;
  country: string;
  visa: Visa;
  issuances: number;
  /** "PDF" (Mar 2017-Sep 2022) or "Excel" (Oct 2022-Sep 2025) publication era. */
  sourceFormat: string;
  sourceFile: string;
  /** year * 12 + (month - 1). Makes month arithmetic and range filters trivial. */
  monthIndex: number;
}

/** Precomputed per-country metrics shipped alongside the annual history. */
export interface CountryMetricRow {
  country: string;
  firstYear: number | null;
  latestYear: number | null;
  latestF1: number | null;
  latestJ1: number | null;
  f1Growth5yrPct: number | null;
  f1Growth10yrPct: number | null;
  f1Cagr10yrPct: number | null;
  f1CagrFullPct: number | null;
  peakHistoricalF1: number | null;
  peakHistoricalF1Year: number | null;
  peakHistoricalJ1: number | null;
  peakHistoricalJ1Year: number | null;
  volatilityScore: number | null;
  trendDirection: string;
  [key: string]: string | number | null;
}

export interface Coord {
  lat: number;
  lon: number;
}

/** Per-country rollup driving the Executive tab and the globe. */
export interface CountrySummaryRow {
  country: string;
  f1Total: number;
  j1Total: number;
  growthPct: number | null;
  seasonalityCv: number | null;
  tier: string;
  opportunityScore: number;
  topPost: string;
  peakMonth: number;
  lat: number | null;
  lon: number | null;
}

/** Derived per-country metrics computed from the annual history at runtime. */
export interface HistoricalMetricRow {
  country: string;
  latestYear: number;
  latestF1: number;
  latestJ1: number;
  f1Growth5yrPct: number | null;
  f1Growth10yrPct: number | null;
  f1Cagr10yrPct: number | null;
  peakHistoricalF1: number;
  peakHistoricalF1Year: number;
  trendDirection: string;
}

/** One row of the Recruitment Command Center table. */
export interface CommandCenterRow {
  country: string;
  region: string;
  currentVolume: number;
  growth5yr: number | null;
  growth10yr: number | null;
  cagr10yr: number | null;
  latest12Total: number;
  prior12Total: number;
  latest12Momentum: number | null;
  recoveryIndex: number | null;
  peakMonth: number | null;
  peakMonthName: string;
  seasonalityRatio: number | null;
  volatilityCv: number | null;
  topOneShare: number | null;
  topThreeShare: number | null;
  concentrationRisk: string;
  marketCategory: string;
  secondaryFlags: string[];
  secondaryFlagsText: string;
  confidence: string;
  recommendedAction: string;
  primaryDriver: string;
  counterSignal: string;
  timing: string;
  caveat: string;
  evidence: string;
}

/** Metrics for a post/country slice of the consulate history. */
export interface PostPeriodMetrics {
  total: number;
  latest12: number;
  peakMonth: number | null;
  peakMonthName: string;
  seasonalityRatio: number | null;
  seasonalityStrength: string;
  volatilityCv: number | null;
  volatility: string;
  baseline2019: number | null;
  recoveryIndex: number | null;
  latest12Change: number | null;
}

/** Everything the dashboard needs, resolved once and shared by all tabs. */
export interface DashboardData {
  operational: OperationalRow[];
  annualCountry: AnnualCountryRow[];
  postsMonthly: PostMonthlyRow[];
  countryMetrics: CountryMetricRow[];
  countryCoords: Record<string, Coord>;
  /** Non-fatal load failure for the consulate layer, mirroring app.py's guard. */
  consulateError: string | null;
}

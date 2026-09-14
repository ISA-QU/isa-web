export type Visa = "F1" | "J1";

/** "F1" | "J1" | "Both" — the visa selector used across every tab. */
export type VisaSelection = Visa | "Both";

/** Operational layer: the most recent calendar years of the post data (see `coverage.operational`). */
export interface OperationalRow {
  post: string;
  country: string;
  visa: Visa;
  year: number;
  month: number;
  issuances: number;
}

/** Annual country/nationality history by fiscal year (October-September). */
export interface AnnualCountryRow {
  fiscalYear: number;
  country: string;
  visa: Visa;
  issuances: number;
}

/** Monthly issuance by consulate/post. */
export interface PostMonthlyRow {
  year: number;
  month: number;
  fiscalYear: number;
  post: string;
  country: string;
  visa: Visa;
  issuances: number;
  /** year * 12 + (month - 1). Makes month arithmetic and range filters trivial. */
  monthIndex: number;
}

export interface Coord {
  lat: number;
  lon: number;
}

/** How one fiscal year of annual history was assembled by the rebuild-dashboard Lambda. */
export interface FiscalYearInfo {
  fiscalYear: number;
  monthsIncluded: number;
  complete: boolean;
  /** "annual" = official annual workbook; "monthly" = summed monthly nationality reports. */
  source: "annual" | "monthly" | "historical-file";
}

/** An inclusive span of `monthIndex` values. */
export interface MonthRange {
  start: number;
  end: number;
}

/** Everything in the snapshot besides the row tables: coverage, provenance, checks. */
export interface SnapshotMeta {
  generatedAt: string;
  coverage: {
    postsMonthly: MonthRange;
    operational: MonthRange;
    nationalityMonthly: MonthRange | null;
    annual: {
      first: number | null;
      latestComplete: number | null;
      latest: number | null;
      latestMonths: number | null;
    };
  };
  fiscalYears: FiscalYearInfo[];
  validation: {
    postsMonthly: {
      rows: number;
      months: number;
      missingMonths: number[];
      posts: number;
      countries: number;
      f1: number;
      j1: number;
      unmappedPosts: Record<string, number>;
    };
    annual: {
      rows?: number;
      countries?: number;
      excludedSpecialCategories?: Record<string, number>;
    };
  };
  sources: Array<{
    file: string;
    kind: "post" | "nationality" | "historical";
    rows: number;
    periods: number;
    replacedPeriods: number;
    modified: string;
  }>;
  warnings: string[];
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
  countryCoords: Record<string, Coord>;
  meta: SnapshotMeta;
}

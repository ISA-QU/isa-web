/**
 * Historical Trends' country cards, moved out of HistoricalTrendsTab.tsx
 * unchanged so the page and the Bobcat's country_trend tool show the same
 * figures. Pure, so the verify script can check them.
 */

import { pctCardText } from "./country360";
import { COUNTRY_SPLITS } from "./cycles";
import { buildAnnualPivot, calculateHistoricalRangeMetrics, pctGrowth } from "./metrics";
import { annualByYear, filledAnnualPivot, fyChange, fyLabel, withMissingYearsAsZero } from "./periods";
import type { AnnualCountryRow } from "./types";

/** The pre-pandemic comparison year. FY2020 (the COVID low) would flatter any recovery. */
export const PRE_PANDEMIC_FY = 2019;

/**
 * One country's annual rows in the fiscal-year range, its pivot (every country
 * ends at the range's last year, missing years as 0; a country that split keeps
 * its own last year), the range metrics, and the KPI cards' values.
 */
export function historicalCards(
  annualCountry: readonly AnnualCountryRow[],
  country: string,
  startYear: number,
  endYear: number,
  latestFy: number,
  provisional: ReadonlySet<number>,
) {
  const selectedRange = annualCountry.filter(
    (r) => r.country === country && r.fiscalYear >= startYear && r.fiscalYear <= endYear,
  );
  const split = COUNTRY_SPLITS[country] !== undefined;
  const pivot = split ? buildAnnualPivot(selectedRange) : filledAnnualPivot(buildAnnualPivot(selectedRange), endYear);
  const metrics = calculateHistoricalRangeMetrics(pivot);

  /* ---- KPI comparisons, each naming its fiscal years ---- */
  const byYear = annualByYear(annualCountry, country, "F1");
  const years = annualCountry.filter((r) => r.country === country).map((r) => r.fiscalYear);
  const countryF1 = split ? byYear : withMissingYearsAsZero(byYear, years.length > 0 ? Math.min(...years) : null, latestFy);
  const shownYear = pivot.length > 0 ? pivot[pivot.length - 1].fiscalYear : null;
  const shownLabel = shownYear !== null ? fyLabel(shownYear, provisional) : "N/A";
  const vsPriorYear = shownYear !== null ? fyChange(countryF1, shownYear, shownYear - 1) : null;
  const vsPeak =
    metrics.latestF1 !== null && metrics.peakF1 !== null ? pctGrowth(metrics.latestF1, metrics.peakF1) : null;
  const vsPrePandemic =
    shownYear !== null && shownYear > PRE_PANDEMIC_FY ? fyChange(countryF1, shownYear, PRE_PANDEMIC_FY) : null;
  // The shared minimum base: "— (low volume)" when the earlier figure is under 100.
  const tenYearBase = shownYear !== null ? (pivot.find((r) => r.fiscalYear === shownYear - 10)?.F1 ?? null) : null;
  const vsPeakText = pctCardText(vsPeak, metrics.peakF1);
  const cards = {
    vsPriorYear: pctCardText(vsPriorYear, shownYear !== null ? countryF1.get(shownYear - 1) : null),
    vsPeak: vsPeakText,
    /** The vs-peak card as shown: "At peak" when the shown year is the peak year. */
    vsPeakShown: metrics.peakF1Year === shownYear && shownYear !== null ? "At peak" : vsPeakText,
    vsPrePandemic: pctCardText(vsPrePandemic, countryF1.get(PRE_PANDEMIC_FY), shownYear !== null && shownYear > PRE_PANDEMIC_FY),
    cagr10: pctCardText(metrics.cagr10yrPct, tenYearBase),
  };
  return { selectedRange, pivot, metrics, countryF1, shownYear, shownLabel, cards };
}

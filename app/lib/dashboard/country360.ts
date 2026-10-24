/**
 * Display rules for Country 360's figures. Display only: the market category,
 * flags and action keep using the same inputs (metrics.ts), so no country
 * changes category or action because of these.
 */

import { LOW_VOLUME, isLowVolume } from "./measures";
import { fiscalYearGrowth, recommendationProfile, sumBy } from "./metrics";
import { arrowPct } from "./rolling";
import type { AnnualCountryRow, Visa } from "./types";

const fyTotal = (rows: readonly AnnualCountryRow[], visas: readonly Visa[], fiscalYear: number) =>
  sumBy(rows.filter((r) => r.fiscalYear === fiscalYear && visas.includes(r.visa)), (r) => r.issuances);

/** Whether a fiscal-year growth's earlier year is under the shared minimum base (100). */
export const growthBaseIsLow = (rows: readonly AnnualCountryRow[], visas: readonly Visa[], baselineYear: number): boolean =>
  isLowVolume(fyTotal(rows, visas, baselineYear));

/**
 * A fiscal-year growth card: "N/A" with no annual rows, "— (low volume)" when
 * the earlier year is under 100 (e.g. North Korea, 1 in FY2015), else "▼ 46.4%".
 */
export function fiscalYearGrowthText(
  rows: readonly AnnualCountryRow[],
  visas: readonly Visa[],
  currentYear: number,
  baselineYear: number,
): string {
  if (rows.length === 0) return "N/A";
  if (growthBaseIsLow(rows, visas, baselineYear)) return LOW_VOLUME;
  return arrowPct(fiscalYearGrowth(rows, visas, currentYear, baselineYear));
}

/**
 * The confidence shown in "What to do": "Low" when the measure is low volume
 * (under 100 in the last 12 months or the 12 before), otherwise unchanged.
 */
export function shownConfidence(
  confidence: string,
  twelve: { current: number; prior: number },
  hasRows: boolean,
): string {
  return hasRows && (isLowVolume(twelve.prior) || isLowVolume(twelve.current)) ? "Low" : confidence;
}

type ProfileRow = Parameters<typeof recommendationProfile>[0];
type Profile = ReturnType<typeof recommendationProfile>;

/**
 * "Why" and "But" without a 10-year growth whose FY base is under 100: the
 * same text the profile would give with no 10-year growth. The action,
 * category and timing stay as they are. `keepPrimaryDriver` keeps a reason
 * set by a restriction or the small/collapsing-market rules.
 */
export function profileForDisplay(
  row: ProfileRow,
  profile: Profile,
  growthBaseLow: boolean,
  keepPrimaryDriver: boolean,
): Profile {
  if (!growthBaseLow || row.growth10yr === null || row.growth10yr === undefined || Number.isNaN(row.growth10yr)) {
    return profile;
  }
  const shown = recommendationProfile({ ...row, growth10yr: null });
  return {
    primaryDriver: keepPrimaryDriver ? profile.primaryDriver : shown.primaryDriver,
    counterSignal: shown.counterSignal,
    timing: profile.timing,
    caveat: shown.caveat,
  };
}

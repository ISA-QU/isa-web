/** Display formatters ported from app.py, including its "N/A" fallbacks. */

import { MONTH_NAMES } from "./constants";
import { notNa } from "./metrics";

const GROUPED = new Intl.NumberFormat("en-US");
const GROUPED_1DP = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** `f"{value:+.1f}%"` — `growth_text` / `metric_pct`. */
export const metricPct = (value: number | null | undefined): string =>
  notNa(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "N/A";

export const growthText = metricPct;

/** `f"{int(value):,}"` — `metric_number`. */
export const metricNumber = (value: number | null | undefined): string =>
  notNa(value) ? GROUPED.format(Math.trunc(value)) : "N/A";

/** `f"{float(value):,.1f}"` — `metric_decimal`. */
export const metricDecimal = (value: number | null | undefined): string =>
  notNa(value) ? GROUPED_1DP.format(value) : "N/A";

/** Plain thousands separators, no null handling. */
export const int = (value: number): string => GROUPED.format(Math.trunc(value));

/** Fixed-decimal helper for ratios and indices. */
export const decimals = (value: number | null | undefined, places: number): string =>
  notNa(value) ? value.toFixed(places) : "N/A";

/** `%b %Y` for a `year * 12 + (month - 1)` index — `month_display`. */
export function monthDisplay(monthIndex: number | null | undefined): string {
  if (monthIndex === null || monthIndex === undefined || Number.isNaN(monthIndex)) return "N/A";
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return `${MONTH_NAMES[month]} ${year}`;
}

/** `month_value_display` — "Sep 2025 · 12,345". */
export function monthValueDisplay(
  monthIndex: number | null | undefined,
  value: number | null | undefined,
): string {
  if (monthIndex === null || monthIndex === undefined || !notNa(value)) return "N/A";
  return `${monthDisplay(monthIndex)} · ${int(value)}`;
}

/** `compact_month_range` — "Mar 2017 to Sep 2025". */
export const compactMonthRange = (start: number, end: number): string =>
  `${monthDisplay(start)} to ${monthDisplay(end)}`;

/** `month_count_between` — inclusive month count. */
export const monthCountBetween = (start: number, end: number): number => end - start + 1;

/** Tone for a growth figure, matching the dashboard's green/red/amber rule. */
export const growthTone = (value: number | null | undefined): "pos" | "neg" | "neutral" => {
  if (!notNa(value)) return "neutral";
  if (value > 0) return "pos";
  if (value < -5) return "neg";
  return "neutral";
};

/** Percentage with a fixed number of decimals, no forced sign. */
export const pct = (value: number | null | undefined, places = 1): string =>
  notNa(value) ? `${value.toFixed(places)}%` : "N/A";

/** Share (0-1) rendered as a percentage. */
export const share = (value: number | null | undefined, places = 1): string =>
  notNa(value) ? `${(value * 100).toFixed(places)}%` : "N/A";

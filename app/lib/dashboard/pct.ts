/**
 * The one percent formatter (Fix pack 11): every 1-decimal percent on the
 * dashboard and in its CSVs goes through pct1(), so the same value never shows
 * differently on two pages.
 *
 * Rounds the raw value once, half away from zero: 75.0515 → "75.1",
 * 6.25 → "6.3", -6.25 → "-6.3". The tiny tolerance lets a decimal half that
 * binary floating point stores as …4999 still round up in magnitude. Values
 * must not be pre-rounded (rounding twice is what made 75.0515 show "75.0").
 * No imports, so every lib file can use it.
 */

const HALF_TOLERANCE = 1e-9;

/** |value| rounded half away from zero to one decimal. */
export const roundPct1 = (value: number): number => Math.floor(Math.abs(value) * 10 + 0.5 + HALF_TOLERANCE) / 10;

/** "75.1", "-6.3": signed like toFixed(1) (a negative under 0.05 still reads "-0.0"). */
export const pct1 = (value: number): string => `${value < 0 ? "-" : ""}${roundPct1(value).toFixed(1)}`;

/** The magnitude only: "6.3" for -6.25 (for "▼ 6.3%", "fell 6.3%"). */
export const pct1Abs = (value: number): string => roundPct1(value).toFixed(1);

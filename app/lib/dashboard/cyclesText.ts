/**
 * Market cycles' sentences and table cells (2b-1), moved out of
 * MarketCycles.tsx unchanged so the page and the Bobcat's market_cycles tool
 * word things the same way. Pure, so the verify script can check them.
 */

import { MONTH_NAMES } from "./constants";
import type { CountryDownturnView, Downturn, HistoryLabel, LatestSignal, RecoverySummary } from "./cycles";
import { int, monthDisplay } from "./format";
import { LOW_VOLUME } from "./measures";
import { arrowPct } from "./rolling";

/** "3 years", "1 year", "2.5 years", "N/A". */
export const yearsText = (n: number | null): string =>
  n === null ? "N/A" : `${Number.isInteger(n) ? n : n.toFixed(1)} year${n === 1 ? "" : "s"}`;

const wholePct = (n: number) => `${Math.round(n)}%`;

/** The recovery summary's headline paragraph (always F1). */
export const recoverySummaryText = (summary: RecoverySummary, first: number): string =>
  `Since FY${first}, ${wholePct(summary.recoveredPct)} of major market downturns fully recovered, typically within ${yearsText(summary.medianYears)} of the low. ` +
  `After COVID, ${wholePct((summary.postCovid.above / Math.max(1, summary.postCovid.markets)) * 100)} of markets were above their FY2019 level by FY2023. ` +
  "Past recoveries don't guarantee future ones.";

/** "FY2026 so far (Oct–Feb): ▼ 40.1% vs the same months of FY2025 (…) — no sign of a bottom yet in data through Feb 2026." */
export function latestSignalText(signal: LatestSignal): string {
  return `FY${signal.fiscalYear} so far (${signal.monthsLabel}): ${signal.changePct === null ? "N/A" : arrowPct(signal.changePct)} vs the same months of FY${signal.fiscalYear - 1} (${int(signal.current)} vs ${int(signal.prior)})${
    signal.reading === "no-bottom"
      ? ` — no sign of a bottom yet in data through ${monthDisplay(signal.dataEnd)}.`
      : signal.reading === "narrowing"
        ? ` — the decline is narrowing in data through ${monthDisplay(signal.dataEnd)}.`
        : ` — up on a year earlier, in data through ${monthDisplay(signal.dataEnd)}.`
  }`;
}

/** "Dec ▼ 35.2%, Jan ▼ 41.0%, Feb ▼ 38.7%": the latest 3 months vs a year earlier. */
export const latestMonthsText = (signal: LatestSignal): string =>
  signal.latestMonths
    .map((m) => `${MONTH_NAMES[(m.monthIndex % 12) + 1]} ${m.changePct === null ? "N/A" : arrowPct(m.changePct)}`)
    .join(", ");

/** One downturn's table cells. `fy` labels a year ("FY2025 (provisional)"); `notYet` is the not-regained text. */
export function downturnCells(
  d: Downturn & { reboundLowVolume?: boolean },
  fy: (year: number) => string,
  notYet: string,
): { peak: string; trough: string; depth: string; rebound: string; regained: string; high: string } {
  return {
    peak: `${fy(d.peakYear)} · ${int(d.peak)}`,
    trough: `${fy(d.troughYear)} · ${int(d.trough)}`,
    depth: arrowPct(d.depthPct),
    rebound: d.reboundPct === null ? "—" : d.reboundLowVolume ? LOW_VOLUME : arrowPct(d.reboundPct),
    regained: d.regainedYear !== null ? `${fy(d.regainedYear)} · ${int(d.regained ?? 0)}` : notYet,
    high: d.newHighYear !== null ? `Yes, ${fy(d.newHighYear)}` : d.regainedYear !== null ? "Not yet" : "—",
  };
}

/** "Not yet (FY2025 provisional)". */
export const notYetText = (last: number, lastIsProvisional: boolean): string =>
  `Not yet${lastIsProvisional ? ` (FY${last} provisional)` : ""}`;

/** The line shown instead of a country's downturn table (split, too few visas, none). */
export function countryDownturnNote(country: string, view: CountryDownturnView, visaWords: string): string | null {
  if (view.kind === "rows") return null;
  if (view.kind === "split") {
    return `${country} split in ${view.year}; later visas are counted under ${view.successors.join(" and under ")}${
      view.lastYear !== null ? ` (last ${visaWords} visas recorded under this name: FY${view.lastYear})` : ""
    }.`;
  }
  if (view.kind === "too-few") {
    return `Too few visas for a downturn history (${country}'s best year: ${int(view.best)} in FY${view.bestYear}).`;
  }
  return `No ${visaWords} visas for ${country} in the annual data.`;
}

/** The "History (F1):" line's text after the label: "Cyclical — has recovered before. Peak FY…". */
export const historyLineText = (h: HistoryLabel): string =>
  `${h.label}${h.label.endsWith(".") ? "" : "."}${h.evidence ? ` ${h.evidence}` : ""}`;

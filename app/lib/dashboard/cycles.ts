/**
 * Market cycles (2b-1): 30 years of annual visas by nationality, downturns from
 * a running peak to a trough, and whether each one regained its peak. Pure
 * functions, so the verify script can check them. Information only: nothing
 * here feeds a market category, action or any existing figure.
 *
 * Downturn rule: a downturn starts when a year is 20%+ below the highest year
 * so far (since the data starts, FY1997) and ends when that peak is regained.
 * A zero year is never a peak, so years before a country appears in the data
 * can't start a downturn.
 */

import { MONTH_NAMES } from "./constants";
import { MIN_BASE } from "./measures";
import { sumBy } from "./metrics";
import type { AnnualCountryRow, NationalityMonthlyRow, Visa } from "./types";

/** A downturn starts at this fraction of the running peak or below (20%+ down). */
export const DOWNTURN_SHARE = 0.8;
/** The recovery summary counts countries with at least this many in their best year. */
export const MAJOR_MARKET_MIN = 500;
/** "Rebound from the trough within 3 years". */
export const REBOUND_YEARS = 3;
/** The latest signal says "no sign of a bottom yet" while each of the latest 3 months is this far below a year earlier. */
export const BOTTOM_THRESHOLD_PCT = -20;

export interface YearValue {
  year: number;
  value: number;
}

/** One value per fiscal year from `first` to `last`; years with no rows are 0. */
export function fiscalYearSeries(
  rows: readonly AnnualCountryRow[],
  visas: readonly Visa[],
  first: number,
  last: number,
  keep: (row: AnnualCountryRow) => boolean = () => true,
): YearValue[] {
  const totals = new Map<number, number>();
  for (const r of rows) {
    if (r.fiscalYear < first || r.fiscalYear > last || !visas.includes(r.visa) || !keep(r)) continue;
    totals.set(r.fiscalYear, (totals.get(r.fiscalYear) ?? 0) + r.issuances);
  }
  const out: YearValue[] = [];
  for (let year = first; year <= last; year += 1) out.push({ year, value: totals.get(year) ?? 0 });
  return out;
}

/** The two world lines: every country, and every country except mainland China. */
export function worldSeries(
  rows: readonly AnnualCountryRow[],
  visas: readonly Visa[],
  first: number,
  last: number,
): { world: YearValue[]; excludingChina: YearValue[] } {
  return {
    world: fiscalYearSeries(rows, visas, first, last),
    excludingChina: fiscalYearSeries(rows, visas, first, last, (r) => r.country !== "China"),
  };
}

export interface Downturn {
  peakYear: number;
  peak: number;
  troughYear: number;
  trough: number;
  /** % from the peak to the trough (negative). */
  depthPct: number;
  /** Best year within 3 years after the trough vs the trough, %; null when the trough is the last year. */
  reboundPct: number | null;
  /** First year back at or above the peak; null = not yet. */
  regainedYear: number | null;
  regained: number | null;
  /** First year above the peak, from the regained year on; null when none yet. */
  newHighYear: number | null;
}

/** Downturns in a yearly series (see the rule at the top of this file). */
export function findDownturns(series: readonly YearValue[]): Downturn[] {
  const out: Downturn[] = [];
  let peakYear = -1;
  let peak = 0;
  let current: Omit<Downturn, "depthPct" | "reboundPct" | "newHighYear"> | null = null;
  for (const { year, value } of series) {
    if (current === null) {
      if (value > peak) {
        peakYear = year;
        peak = value;
      } else if (peak > 0 && value <= DOWNTURN_SHARE * peak) {
        current = { peakYear, peak, troughYear: year, trough: value, regainedYear: null, regained: null };
      }
    } else {
      if (value < current.trough) {
        current.troughYear = year;
        current.trough = value;
      }
      if (value >= current.peak) {
        current.regainedYear = year;
        current.regained = value;
        out.push(finish(current, series));
        current = null;
        peakYear = year;
        peak = value;
      }
    }
  }
  if (current !== null) out.push(finish(current, series));
  return out;
}

function finish(d: Omit<Downturn, "depthPct" | "reboundPct" | "newHighYear">, series: readonly YearValue[]): Downturn {
  const after = series.filter((p) => p.year > d.troughYear && p.year <= d.troughYear + REBOUND_YEARS);
  const best = after.length > 0 ? Math.max(...after.map((p) => p.value)) : null;
  const newHigh =
    d.regainedYear === null ? undefined : series.find((p) => p.year >= d.regainedYear! && p.value > d.peak);
  return {
    ...d,
    depthPct: ((d.trough - d.peak) / d.peak) * 100,
    reboundPct: best === null || d.trough <= 0 ? null : ((best - d.trough) / d.trough) * 100,
    newHighYear: newHigh?.year ?? null,
  };
}

/** F1 (or the selected visas) per country, one fiscal-year series each. */
export function seriesByCountry(
  rows: readonly AnnualCountryRow[],
  visas: readonly Visa[],
  first: number,
  last: number,
): Map<string, YearValue[]> {
  const byCountry = new Map<string, AnnualCountryRow[]>();
  for (const r of rows) {
    const list = byCountry.get(r.country);
    if (list) list.push(r);
    else byCountry.set(r.country, [r]);
  }
  return new Map([...byCountry].map(([c, list]) => [c, fiscalYearSeries(list, visas, first, last)]));
}

export interface RecoverySummary {
  markets: number;
  downturns: number;
  recovered: number;
  recoveredPct: number;
  /** Median years from the trough to the year the peak was regained. */
  medianYears: number | null;
  /** Downturns whose peak was in FY2000–FY2002 (around 9/11). */
  early: { downturns: number; recovered: number; medianYears: number | null };
  /** Countries with MAJOR_MARKET_MIN+ in FY2019, and how many were above it in FY2023. */
  postCovid: { markets: number; above: number };
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Every downturn in every country with a best year of MAJOR_MARKET_MIN+ (F1 by default). */
export function recoverySummary(byCountry: ReadonlyMap<string, readonly YearValue[]>): RecoverySummary {
  const all: Downturn[] = [];
  let markets = 0;
  let covidMarkets = 0;
  let covidAbove = 0;
  for (const series of byCountry.values()) {
    const at = (year: number) => series.find((p) => p.year === year)?.value ?? 0;
    if (at(2019) >= MAJOR_MARKET_MIN) {
      covidMarkets += 1;
      if (at(2023) > at(2019)) covidAbove += 1;
    }
    if (Math.max(0, ...series.map((p) => p.value)) < MAJOR_MARKET_MIN) continue;
    markets += 1;
    all.push(...findDownturns(series));
  }
  const recovered = all.filter((d) => d.regainedYear !== null);
  const early = all.filter((d) => d.peakYear >= 2000 && d.peakYear <= 2002);
  const earlyRecovered = early.filter((d) => d.regainedYear !== null);
  return {
    markets,
    downturns: all.length,
    recovered: recovered.length,
    recoveredPct: all.length > 0 ? (recovered.length / all.length) * 100 : 0,
    medianYears: median(recovered.map((d) => d.regainedYear! - d.troughYear)),
    early: {
      downturns: early.length,
      recovered: earlyRecovered.length,
      medianYears: median(earlyRecovered.map((d) => d.regainedYear! - d.troughYear)),
    },
    postCovid: { markets: covidMarkets, above: covidAbove },
  };
}

export interface LatestSignal {
  /** e.g. 2026 */
  fiscalYear: number;
  /** "Oct–Feb" */
  monthsLabel: string;
  current: number;
  prior: number;
  changePct: number | null;
  /** The latest 3 months, each vs the same month a year earlier (%). */
  latestMonths: Array<{ monthIndex: number; changePct: number | null }>;
  /** "no-bottom": each of the latest 3 months 20%+ below a year earlier; "narrowing": a smaller fall; "growing": up overall. */
  reading: "no-bottom" | "narrowing" | "growing";
  /** The data's last month (month index). */
  dataEnd: number;
}

/**
 * The fiscal year so far (Oct to the data's last month) vs the same months a
 * year earlier, from the monthly nationality data, countries only. "No sign of
 * a bottom yet" while each of the latest 3 months is 20%+ below the same month
 * a year earlier; otherwise "the decline is narrowing".
 */
export function latestSignal(
  rows: readonly NationalityMonthlyRow[],
  visas: readonly Visa[],
  dataEnd: number,
  keep: (row: NationalityMonthlyRow) => boolean = () => true,
): LatestSignal {
  const month = (dataEnd % 12) + 1;
  const fyStart = month >= 10 ? Math.floor(dataEnd / 12) * 12 + 9 : (Math.floor(dataEnd / 12) - 1) * 12 + 9;
  const scoped = rows.filter((r) => r.isCountry && visas.includes(r.visa) && keep(r));
  const inSpan = (a: number, b: number) => sumBy(scoped.filter((r) => r.monthIndex >= a && r.monthIndex <= b), (r) => r.issuances);
  const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);
  const current = inSpan(fyStart, dataEnd);
  const prior = inSpan(fyStart - 12, dataEnd - 12);
  const latestMonths = [dataEnd - 2, dataEnd - 1, dataEnd].map((m) => ({
    monthIndex: m,
    changePct: pct(inSpan(m, m), inSpan(m - 12, m - 12)),
  }));
  const changePct = pct(current, prior);
  const noBottom = latestMonths.every((m) => m.changePct !== null && m.changePct <= BOTTOM_THRESHOLD_PCT);
  return {
    fiscalYear: Math.floor(fyStart / 12) + 1,
    monthsLabel: fyStart === dataEnd ? MONTH_NAMES[10] : `${MONTH_NAMES[10]}–${MONTH_NAMES[month]}`,
    current,
    prior,
    changePct,
    latestMonths,
    reading: changePct !== null && changePct >= 0 ? "growing" : noBottom ? "no-bottom" : "narrowing",
    dataEnd,
  };
}

/** Countries that split: their later visas are counted under the new countries. */
export const COUNTRY_SPLITS: Readonly<Record<string, { year: number; successors: readonly string[] }>> = {
  "Serbia and Montenegro": { year: 2006, successors: ["Serbia", "Montenegro"] },
};

export type CountryDownturnView =
  | { kind: "no-visas" }
  | { kind: "split"; year: number; successors: readonly string[]; lastYear: number | null }
  | { kind: "too-few"; best: number; bestYear: number }
  | { kind: "rows"; rows: Array<Downturn & { reboundLowVolume: boolean }> };

/**
 * The selected country's downturn table, with the shared minimum base (100):
 * a country whose best year is under 100 gets a "too few visas" line; only
 * downturns from a peak of 100+ are listed; a rebound from a trough under 100
 * shows "— (low volume)". A country that split gets a note instead of rows.
 */
export function countryDownturnView(country: string, series: readonly YearValue[]): CountryDownturnView {
  const split = COUNTRY_SPLITS[country];
  const withVisas = series.filter((p) => p.value > 0);
  if (split) {
    return { kind: "split", ...split, lastYear: withVisas.length > 0 ? withVisas[withVisas.length - 1].year : null };
  }
  if (withVisas.length === 0) return { kind: "no-visas" };
  // The best year; ties go to the earliest.
  const best = withVisas.reduce((a, b) => (b.value > a.value ? b : a));
  if (best.value < MIN_BASE) return { kind: "too-few", best: best.value, bestYear: best.year };
  return {
    kind: "rows",
    rows: findDownturns(series)
      .filter((d) => d.peak >= MIN_BASE)
      .map((d) => ({ ...d, reboundLowVolume: d.trough < MIN_BASE })),
  };
}

/* ---- 2b-1b: the selected country compared with the world ---- */

/** The pre-pandemic year both lines are indexed to. */
export const INDEX_BASE_YEAR = 2019;
/** Within this many percentage points of the world: "about in line with the market". */
export const IN_LINE_POINTS = 2;

const valueAt = (series: readonly YearValue[], year: number): number => series.find((p) => p.year === year)?.value ?? 0;
const change = (now: number, before: number): number => ((now - before) / before) * 100;

export interface CountryVsWorld {
  latestYear: number;
  /** Years from FY2019 to the latest year (6 today). */
  years: number;
  /** FY2019 under 100: no "since FY2019" comparison, index line or share view. */
  baseLow: boolean;
  /** The year before the latest under 100: no "last year" comparison. */
  lastLow: boolean;
  countryLast: number | null;
  worldLast: number;
  countrySince: number | null;
  worldSince: number;
  /** Indexed to FY2019 = 100; null when the FY2019 base is under 100. */
  countryIndex: YearValue[] | null;
  worldIndex: YearValue[];
  /** % of world visas each year; null when the FY2019 base is under 100. */
  share: YearValue[] | null;
  sentence: string;
}

/** "fell 53.4%", "rose 12.0%", "was unchanged". */
const moved = (pct: number) => (pct < 0 ? `fell ${Math.abs(pct).toFixed(1)}%` : pct > 0 ? `rose ${pct.toFixed(1)}%` : "was unchanged");
/** "down 8.3%", "up 283.0%", "unchanged". */
const level = (pct: number) => (pct < 0 ? `down ${Math.abs(pct).toFixed(1)}%` : pct > 0 ? `up ${pct.toFixed(1)}%` : "unchanged");

/**
 * The country against the world, both for the selected visas, over complete
 * fiscal years: last year's change, the change since FY2019, the FY2019 index,
 * the share of world visas, and one plain sentence. The shared minimum base
 * (100) applies to FY2019 and to the year before the latest.
 */
export function countryVsWorld(
  country: string,
  countrySeries: readonly YearValue[],
  world: readonly YearValue[],
  opts: { visaWords: string; latestProvisional: boolean },
): CountryVsWorld {
  const latestYear = world[world.length - 1].year;
  const prevYear = latestYear - 1;
  const years = latestYear - INDEX_BASE_YEAR;
  const c = (y: number) => valueAt(countrySeries, y);
  const w = (y: number) => valueAt(world, y);
  const baseLow = c(INDEX_BASE_YEAR) < MIN_BASE;
  const lastLow = c(prevYear) < MIN_BASE;
  const countryLast = lastLow ? null : change(c(latestYear), c(prevYear));
  const countrySince = baseLow ? null : change(c(latestYear), c(INDEX_BASE_YEAR));
  const worldLast = change(w(latestYear), w(prevYear));
  const worldSince = change(w(latestYear), w(INDEX_BASE_YEAR));
  const indexOf = (series: readonly YearValue[], base: number) => series.map((p) => ({ year: p.year, value: (p.value / base) * 100 }));

  // Last year: faster / less / in line, and whether it was worse or better than the world.
  let first: string;
  let firstTone: "worse" | "better" | "same" | null = null;
  if (countryLast === null) {
    first = `Last year: — (low volume) (${country}'s FY${prevYear} base is under ${MIN_BASE}).`;
  } else {
    const gap = countryLast - worldLast;
    firstTone = Math.abs(gap) <= IN_LINE_POINTS ? "same" : gap < 0 ? "worse" : "better";
    const phrase =
      firstTone === "same"
        ? "about in line with the market"
        : countryLast < 0 && worldLast < 0
          ? `${country} fell ${gap < 0 ? "faster" : "less"} than the market`
          : countryLast >= 0 && worldLast < 0
            ? `${country} rose while the market fell`
            : countryLast < 0
              ? `${country} fell while the market grew`
              : `${country} grew ${gap > 0 ? "faster" : "slower"} than the market`;
    first = `Last year ${country} ${moved(countryLast)} (FY${latestYear} vs FY${prevYear}${opts.latestProvisional ? ", provisional" : ""}) while the world ${moved(worldLast)} — ${phrase}.`;
  }

  // Since FY2019: ahead / behind / in line; "still" when it contrasts with last year.
  let second: string;
  if (countrySince === null) {
    second = `Since FY${INDEX_BASE_YEAR}: — (low volume) (${country}'s FY${INDEX_BASE_YEAR} base is under ${MIN_BASE}).`;
  } else {
    const gap = countrySince - worldSince;
    const tone = Math.abs(gap) <= IN_LINE_POINTS ? "same" : gap > 0 ? "better" : "worse";
    const still = (tone === "better" && firstTone === "worse") || (tone === "worse" && firstTone === "better") ? "still " : "";
    const verdict = tone === "same" ? "about in line with the market" : `${still}${tone === "better" ? "ahead of" : "behind"} the market`;
    const versus =
      Math.sign(countrySince) === Math.sign(worldSince)
        ? `${level(countrySince)} vs the world's ${Math.abs(worldSince).toFixed(1)}%`
        : `${level(countrySince)} while the world is ${level(worldSince)}`;
    second = `Since FY${INDEX_BASE_YEAR}, ${country} is ${versus} — ${verdict} over ${years} years.`;
  }

  const sentence =
    countryLast === null && countrySince === null
      ? `Too few ${opts.visaWords} visas to compare ${country} with the world (FY${INDEX_BASE_YEAR}: ${c(INDEX_BASE_YEAR).toLocaleString("en-US")}, FY${prevYear}: ${c(prevYear).toLocaleString("en-US")} — both under ${MIN_BASE}).`
      : `${first} ${second}`;

  return {
    latestYear,
    years,
    baseLow,
    lastLow,
    countryLast,
    worldLast,
    countrySince,
    worldSince,
    countryIndex: baseLow ? null : indexOf(countrySeries, c(INDEX_BASE_YEAR)),
    worldIndex: indexOf(world, w(INDEX_BASE_YEAR)),
    share: baseLow ? null : countrySeries.map((p) => ({ year: p.year, value: w(p.year) > 0 ? (p.value / w(p.year)) * 100 : 0 })),
    sentence,
  };
}

/**
 * The "World excluding mainland China" note, from the data: mainland China's
 * share of world visas in the world's peak year, and the best later year of the
 * rest of the world as a % of its own level in that peak year.
 */
export function chinaNote(
  world: readonly YearValue[],
  excludingChina: readonly YearValue[],
): { peakYear: number; chinaSharePct: number; bestYear: number; restPctOfPeak: number } | null {
  if (world.length === 0) return null;
  const peak = world.reduce((a, b) => (b.value > a.value ? b : a));
  const restAtPeak = valueAt(excludingChina, peak.year);
  const later = excludingChina.filter((p) => p.year > peak.year);
  if (peak.value <= 0 || restAtPeak <= 0 || later.length === 0) return null;
  const best = later.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    peakYear: peak.year,
    chinaSharePct: ((peak.value - restAtPeak) / peak.value) * 100,
    bestYear: best.year,
    restPctOfPeak: (best.value / restAtPeak) * 100,
  };
}

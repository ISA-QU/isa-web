/**
 * The Bobcat's tools (Step 1): eleven read-only answers built from the loaded
 * snapshot with the same functions and formatters the tabs use, so a number
 * here can't differ from the page. Each returns ready-made lines, the source
 * (tab · measure · period) and the tab that shows the same figures. Monthly
 * figures always use the last 12 months, whatever the Period control says.
 *
 * Missing tables never crash a tool: it says the data isn't available yet, or
 * names the fallback it uses (as the pages do). No network calls, no model.
 */

import { MARKET_CATEGORIES } from "../constants";
import {
  buildConsulateTable,
  consulateChangeText,
  consulateContext,
  consulateRecoveryText,
  consulateStatus,
  dormantConsulates,
  lastIssuanceText,
  noIssuanceNotice,
  previousPeriod,
  recoveryYearOf,
} from "../consulates";
import { tenYearTrendText, trendCellText } from "../country360";
import {
  COUNTRY_SPLITS,
  INDEX_BASE_YEAR,
  countryDownturnView,
  countryVsWorld,
  declineHistory,
  findDownturns,
  fiscalYearSeries,
  historyLabel,
  historyNote,
  latestSignal,
  recoverySummary,
  seriesByCountry,
  worldSeries,
} from "../cycles";
import {
  countryDownturnNote,
  downturnCells,
  historyLineText,
  latestMonthsText,
  latestSignalText,
  notYetText,
  recoverySummaryText,
} from "../cyclesText";
import {
  EVENTS,
  EVENTS_LAST_CHECKED,
  countryNote,
  eventDateText,
  fiscalYearOf,
  selectEvents,
  sourceSite,
  type DashboardEvent,
} from "../events";
import { int, metricNumber, monthDisplay } from "../format";
import { historicalCards, PRE_PANDEMIC_FY } from "../historicalCards";
import {
  annualRowsByCountry,
  controlCountries,
  countrySignalRow,
  marketActionText,
  marketChangeText,
  marketHistories,
  marketHistory,
  marketRows,
  marketSignals,
  marketsInScope,
  sortMarkets,
  type MarketRow,
} from "../markets";
import { LOW_VOLUME, MIN_BASE, changeText, latestCompleteYearOf } from "../measures";
import { historicalCountryName, notNa, selectedVisaClasses } from "../metrics";
import { pct1 } from "../pct";
import { provisionalFiscalYears, resolvePeriod } from "../periods";
import {
  LAST_CHECKED,
  RESTRICTED_NON_COUNTRY,
  RESTRICTIONS,
  RESTRICTION_SMALL_PRINT,
  consulateScopeNotes,
  pausedPostText,
  restrictionBadgeText,
  restrictionDate,
  restrictionShortLabel,
  restrictionTooltip,
  restrictionsFor,
  type Restriction,
} from "../restrictions";
import { arrowPct, monthRangeLabel } from "../rolling";
import { sortBy } from "../sort";
import type { CommandCenterRow, DashboardData, MonthRange, Visa, VisaSelection } from "../types";
import { matchOption } from "../url";
import { UNITED_STATES_NOTE, normalize, resolveCountry } from "./countries";
import { DEFINITIONS } from "./definitions";
import { TAB_LABELS, type ExternalLink, type SourceLine, type TabLink, type ToolContext, type ToolDef, type ToolResult } from "./types";

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

const visaLabel = (visa: VisaSelection): string => (visa === "Both" ? "F1 + J1" : visa);
/** "F1", "J1" or "F1 or J1", as Market cycles words it. */
const visaWords = (visas: readonly Visa[]): string => (visas.length === 2 ? "F1 or J1" : visas[0]);

/** Per-snapshot cache: the tools are called many times on the same data. */
const caches = new WeakMap<DashboardData, Map<string, unknown>>();
function memo<T>(data: DashboardData, key: string, make: () => T): T {
  let cache = caches.get(data);
  if (!cache) {
    cache = new Map();
    caches.set(data, cache);
  }
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

/** The last 12 months and the 12 before, as Markets and Country 360 use them. */
function twelveMonths(data: DashboardData): { range: MonthRange; prior: MonthRange | null; label: string; priorLabel: string; period: string } {
  return memo(data, "twelve", () => {
    const coverage = data.meta.coverage.postsMonthly;
    const range = resolvePeriod({ kind: "last12" }, coverage);
    const prior = previousPeriod(range, coverage);
    const label = monthRangeLabel(range);
    const priorLabel = prior ? monthRangeLabel(prior) : "";
    return {
      range,
      prior,
      label,
      priorLabel,
      period: `last 12 months (${label})${prior ? ` vs the previous 12 months (${priorLabel})` : ""}`,
    };
  });
}

const provisionalOf = (data: DashboardData) => memo(data, "provisional", () => provisionalFiscalYears(data.meta.fiscalYears));

/** First and latest complete fiscal years, and "FY1997–FY2025 (FY2025 provisional)". */
function fiscalSpan(data: DashboardData) {
  const first = data.meta.coverage.annual.first ?? 1997;
  const last = data.meta.coverage.annual.latestComplete ?? first;
  const provisional = provisionalOf(data);
  return {
    first,
    last,
    provisional,
    lastIsProvisional: provisional.has(last),
    label: `FY${first}–FY${last}${provisional.has(last) ? ` (FY${last} provisional)` : ""}`,
  };
}

const countriesOf = (data: DashboardData) => memo(data, "countries", () => controlCountries(data));
const nationalityCountriesOf = (data: DashboardData) =>
  memo(data, "nationalityCountries", () => new Set((data.nationalityMonthly ?? []).filter((r) => r.isCountry).map((r) => r.country)));
const signalsFor = (data: DashboardData, visa: VisaSelection) =>
  memo(data, `signals:${visa}`, () => marketSignals(data, visa, countriesOf(data)));
const rowsFor = (data: DashboardData, visa: VisaSelection): MarketRow[] =>
  memo(data, `rows:${visa}`, () => {
    const t = twelveMonths(data);
    return marketRows(signalsFor(data, visa), data, visa, t.range, t.prior);
  });
const historiesOf = (data: DashboardData) => memo(data, "histories", () => marketHistories(data));
const annualByCountryOf = (data: DashboardData) => memo(data, "annualByCountry", () => annualRowsByCountry(data.annualCountry));

const source = (tab: string, measure: string, period: string): SourceLine => ({ tab, measure, period });

function result(tool: string, title: string, lines: string[], sources: SourceLine[], link: TabLink | null, extra: Partial<ToolResult> = {}): ToolResult {
  return { tool, status: "ok", title, lines, sources, link, ...extra };
}

/** A known gap, said plainly: "This data isn't available yet…". */
function notInData(tool: string, title: string, line: string, sources: SourceLine[], link: TabLink | null, extra: Partial<ToolResult> = {}): ToolResult {
  return { tool, status: "not-in-data", title, lines: [line], sources, link, ...extra };
}

const DATA_SOURCE = source("Dashboard", "data snapshot", "the loaded snapshot");

const tableMissing = (tool: string, table: string): ToolResult =>
  notInData(tool, "This data isn't available yet", `This data isn't available yet: the dashboard's data snapshot has no ${table}.`, [DATA_SOURCE], null);

type Found = { country: string } | { answer: ToolResult };

/** The country, or the answer to give instead (unknown name with suggestions, or the United States). */
function findCountry(ctx: ToolContext, tool: string, raw: string | number | undefined): Found {
  const text = raw === undefined ? "" : String(raw);
  if (!text.trim()) {
    return {
      answer: { tool, status: "unknown", title: "Which country?", lines: ["Name a country, e.g. India or Vietnam."], sources: [DATA_SOURCE], link: null },
    };
  }
  const match = resolveCountry(text, countriesOf(ctx.data));
  if (match.kind === "found") return { country: match.country };
  if (match.kind === "united-states") {
    return { answer: notInData(tool, "The United States isn't in this data", UNITED_STATES_NOTE, [DATA_SOURCE], null) };
  }
  return {
    answer: {
      tool,
      status: "unknown-country",
      title: `I don't know "${text}"`,
      lines: [
        match.suggestions.length > 0
          ? `"${text}" isn't a country name in the dashboard's data. Did you mean ${match.suggestions.join(", ")}?`
          : `"${text}" isn't a country name in the dashboard's data.`,
      ],
      sources: [DATA_SOURCE],
      link: null,
      suggestions: match.suggestions,
    },
  };
}

const visaArg = (ctx: ToolContext, raw: string | number | undefined): VisaSelection => {
  const v = raw === undefined ? "" : normalize(String(raw)).replace(/\s+/g, "");
  if (v === "f1" || v === "student") return "F1";
  if (v === "j1" || v === "exchange") return "J1";
  if (v === "both" || v === "f1j1" || v === "all") return "Both";
  return ctx.visa;
};

/** A country's restriction tags for a list row: " · Travel ban (partial) since 1 Jan 2026". */
const restrictionTags = (country: string): string =>
  restrictionsFor(country)
    .map((r) => ` · ${restrictionShortLabel(r)}${r.restored ? "" : ` since ${restrictionDate(r.suspendedSince ?? r.effective)}`}`)
    .join("");

const restrictionLinks = (rs: readonly Restriction[]): ExternalLink[] => {
  const seen = new Map<string, ExternalLink>();
  for (const r of rs) {
    for (const s of r.sources) {
      if (!seen.has(s.url)) seen.set(s.url, { label: `${s.title}${s.updated ? `, last updated ${restrictionDate(s.updated)}` : ""}`, url: s.url });
    }
  }
  return [...seen.values()];
};

const lastChecked = `Last checked ${restrictionDate(LAST_CHECKED)}.`;

/* ------------------------------------------------------------------ *
 * The tools
 * ------------------------------------------------------------------ */

const dataCoverage: ToolDef = {
  name: "data_coverage",
  description: "What the data covers: months, fiscal years, which year is provisional, and what 'last 12 months' means.",
  params: {},
  run: (ctx) => {
    const { data } = ctx;
    const c = data.meta.coverage;
    const t = twelveMonths(data);
    const fy = fiscalSpan(data);
    const partial = data.meta.fiscalYears.find((f) => !f.complete && f.fiscalYear > fy.last);
    const lines = [
      data.postsMonthly.length > 0
        ? `Monthly consulate data: ${monthDisplay(c.postsMonthly.start)} – ${monthDisplay(c.postsMonthly.end)}.`
        : "Monthly consulate data: not in this data snapshot.",
      data.nationalityMonthly && c.nationalityMonthly
        ? `Monthly nationality data: ${monthDisplay(c.nationalityMonthly.start)} – ${monthDisplay(c.nationalityMonthly.end)}.`
        : "Monthly nationality data: not in this data snapshot yet, so Markets and Country 360 count visas by the country where they were issued.",
      data.annualCountry.length > 0
        ? `Annual data by nationality: FY${fy.first}–FY${fy.last} (complete fiscal years).`
        : "Annual data by nationality: not in this data snapshot.",
      ...(fy.lastIsProvisional
        ? [`FY${fy.last} is provisional: summed from the monthly reports; official annual figures will replace it.`]
        : []),
      ...(partial ? [`FY${partial.fiscalYear} so far: ${partial.monthsIncluded} months, left off the yearly charts.`] : []),
      `"Last 12 months" means ${t.label} on every tab.`,
    ];
    return result(
      "data_coverage",
      `Data through ${monthDisplay(c.postsMonthly.end)}`,
      lines,
      [source("Markets", "Data through", `data through ${monthDisplay(c.postsMonthly.end)}`)],
      { tab: "markets" },
    );
  },
};

const countryOverview: ToolDef = {
  name: "country_overview",
  description: "How a country is doing: the last 12 months vs the 12 before, recovery vs 2019, category, what to do, timing and peak month (Country 360's What to do).",
  params: {
    country: { type: "string", description: "Country name" },
    visa: { type: "string", description: "F1, J1 or Both", options: ["F1", "J1", "Both"], optional: true },
  },
  run: (ctx, args) => {
    const found = findCountry(ctx, "country_overview", args.country);
    if ("answer" in found) return found.answer;
    const { country } = found;
    const { data } = ctx;
    const visa = visaArg(ctx, args.visa);
    const vl = visaLabel(visa);
    const t = twelveMonths(data);
    const link: TabLink = { tab: "country-360", country, visa, period: "last12" };
    const row: CommandCenterRow | null = countrySignalRow(data, country, visa);
    const byNationality = nationalityCountriesOf(data).has(country);
    const src = source("Country 360", byNationality ? `nationals of ${country}, ${vl} (What to do)` : `visas issued in ${country}, ${vl}`, t.period);
    if (!row) {
      return notInData("country_overview", `${country}, ${vl}`, `The dashboard has no monthly ${vl} figures for ${country}.`, [src], link, { country });
    }
    const recoveryYear = latestCompleteYearOf(data.meta.coverage.postsMonthly);
    const recovery = notNa(row.recoveryIndex) ? row.recoveryIndex.toFixed(0) : row.hasConsulateData ? LOW_VOLUME : "N/A";
    const hideTiming = "hideTiming" in row && (row as { hideTiming?: boolean }).hideTiming === true;
    const lines = [
      `${byNationality ? `Nationals of ${country}` : `Visas issued in ${country}`}, ${vl}, last 12 months (${t.label}): ${int(row.latest12Total)}`,
      `Previous 12 months (${t.priorLabel}): ${int(row.prior12Total)} · change ${changeText(row.latest12Momentum, row.prior12Total, arrowPct)}`,
      `Recovery (${recoveryYear} vs 2019): ${recovery}`,
      `Category: ${row.marketCategory}`,
      `What to do: ${marketActionText(row, historiesOf(data))}`,
      ...(row.timing && !hideTiming ? [`Timing: ${row.timing}`] : []),
      `Peak month (typical year): ${row.peakMonth ? row.peakMonthName : row.peakMonthName || "N/A"}`,
      ...restrictionsFor(country).map(restrictionBadgeText),
    ];
    const notes = [
      ...(byNationality
        ? []
        : [`Monthly nationality figures for ${country} aren't in this data, so these count visas issued in ${country}, as Country 360 does.`]),
      ...(restrictionsFor(country).length > 0 ? [RESTRICTION_SMALL_PRINT] : []),
    ];
    return result("country_overview", `${country}, ${vl}`, lines, [src], link, {
      country,
      notes,
      links: restrictionLinks(restrictionsFor(country)),
    });
  },
};

const countryTrend: ToolDef = {
  name: "country_trend",
  description: "A country's long-term trend: the Historical Trends cards (latest fiscal year, vs last year, vs peak, vs FY2019, 10-year CAGR) and Markets' 10- and 5-year trend.",
  params: {
    country: { type: "string", description: "Country name" },
    visa: { type: "string", description: "F1, J1 or Both (the 10- and 5-year trend)", options: ["F1", "J1", "Both"], optional: true },
  },
  run: (ctx, args) => {
    const { data } = ctx;
    if (data.annualCountry.length === 0) return tableMissing("country_trend", "annual nationality table");
    const found = findCountry(ctx, "country_trend", args.country);
    if ("answer" in found) return found.answer;
    const { country } = found;
    const visa = visaArg(ctx, args.visa);
    const vl = visaLabel(visa);
    const fy = fiscalSpan(data);
    const link: TabLink = { tab: "historical-trends", country, visa };
    const annualRows = annualByCountryOf(data).get(historicalCountryName(country)) ?? [];
    const histSource = source("Historical Trends", `${country}, F1 and J1 by nationality (country cards)`, fy.label);
    if (annualRows.length === 0) {
      return notInData("country_trend", `${country}: long-term trend`, `The annual nationality data has no figures for ${country}.`, [histSource], link, { country });
    }
    const hc = historicalCards(data.annualCountry, country, fy.first, fy.last, fy.last, fy.provisional);
    const y = hc.shownYear;
    const lines = [
      `F1 by nationality, ${hc.shownLabel}: ${metricNumber(hc.metrics.latestF1)}`,
      `J1 by nationality, ${hc.shownLabel}: ${metricNumber(hc.metrics.latestJ1)}`,
      ...(y !== null
        ? [
            `F1 vs FY${y - 1}: ${hc.cards.vsPriorYear}`,
            `F1 vs peak (${hc.metrics.peakF1Year !== null ? `FY${hc.metrics.peakF1Year}` : "N/A"}): ${hc.cards.vsPeakShown}`,
            `F1 vs FY${PRE_PANDEMIC_FY} (pre-pandemic): ${hc.cards.vsPrePandemic}`,
            `F1 10-year CAGR, FY${y - 10}–FY${y}: ${hc.cards.cagr10}`,
          ]
        : []),
    ];
    const sources = [histSource];
    const row = rowsFor(data, visa).find((r) => r.country === country);
    if (row) {
      const visas = selectedVisaClasses(visa);
      lines.push(
        `10-year trend, ${vl} (FY${fy.last - 10} → FY${fy.last}): ${tenYearTrendText(row.growth10yr, annualRows, visas, fy.last)}`,
        `5-year trend, ${vl} (FY${fy.last - 5} → FY${fy.last}): ${trendCellText(row.growth5yr, annualRows, visas, fy.last, 5)}`,
      );
      sources.push(source("Markets", `10- and 5-year trend, ${vl} by nationality`, `FY${fy.last - 10} → FY${fy.last}`));
    }
    const notes =
      y !== null && fy.provisional.has(y)
        ? [`FY${y} is provisional: summed from the monthly reports; official annual figures will replace it.`]
        : [];
    return result("country_trend", `${country}: long-term trend`, lines, sources, link, { country, notes });
  },
};

const LIST_SORTS = ["nationals", "growing", "declining", "10-year"] as const;
type ListSort = (typeof LIST_SORTS)[number];

const listMarkets: ToolDef = {
  name: "list_markets",
  description:
    "Markets table rows: the largest, fastest-growing, biggest declines or best 10-year trend, by visa, region and category, with a minimum size (default 100 in the last 12 months), up to 15 rows. Restricted countries carry their ban or pause.",
  params: {
    sort: { type: "string", description: "nationals, growing, declining or 10-year", options: LIST_SORTS, optional: true },
    visa: { type: "string", description: "F1, J1 or Both", options: ["F1", "J1", "Both"], optional: true },
    region: { type: "string", description: "A region, or All", optional: true },
    category: { type: "string", description: "A market category, or All", options: ["All", ...MARKET_CATEGORIES], optional: true },
    min: { type: "number", description: "Minimum in the last 12 months (default 100)", optional: true },
    limit: { type: "number", description: "Rows to show, 1–15 (default 10)", optional: true },
  },
  run: (ctx, args) => {
    const { data } = ctx;
    const tool = "list_markets";
    const visa = visaArg(ctx, args.visa);
    const vl = visaLabel(visa);
    const t = twelveMonths(data);
    const link: TabLink = { tab: "markets", visa, period: "last12" };
    const byNationality = data.nationalityMonthly !== null;
    const rows = rowsFor(data, visa);
    const regions = [...new Set(rows.map((r) => r.region))].sort();
    const sort: ListSort = (LIST_SORTS as readonly string[]).includes(String(args.sort ?? "")) ? (args.sort as ListSort) : "nationals";
    const regionRaw = args.region === undefined ? "All" : String(args.region);
    const region = regionRaw.toLowerCase() === "all" ? "All" : matchOption(regionRaw, regions);
    const categoryRaw = args.category === undefined ? "All" : String(args.category);
    const category = categoryRaw.toLowerCase() === "all" ? "All" : matchOption(categoryRaw, MARKET_CATEGORIES);
    const unknownSrc = [source("Markets", "filters", "—")];
    if (!region) {
      return { tool, status: "unknown", title: `I don't know the region "${regionRaw}"`, lines: [`The dashboard's regions are: ${regions.join(", ")}.`], sources: unknownSrc, link, suggestions: regions };
    }
    if (!category) {
      return { tool, status: "unknown", title: `I don't know the category "${categoryRaw}"`, lines: [`The market categories are: ${MARKET_CATEGORIES.join(", ")}.`], sources: unknownSrc, link, suggestions: [...MARKET_CATEGORIES] };
    }
    const min = typeof args.min === "number" && Number.isFinite(args.min) && args.min >= 0 ? Math.floor(args.min) : MIN_BASE;
    const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.min(15, Math.max(1, Math.floor(args.limit))) : 10;

    const inScope = marketsInScope(rows, min, region);
    const byNationals = sortMarkets(inScope, category, "Nationals");
    const sorted =
      sort === "growing"
        ? sortMarkets(inScope, category, "Change").filter((r) => r.periodChange !== null && r.periodChange > 0)
        : sort === "declining"
          ? sortBy(byNationals, [(r) => r.periodChange], true).filter((r) => r.periodChange !== null && r.periodChange < 0)
          : sort === "10-year"
            ? sortMarkets(inScope, category, "10-year trend")
            : byNationals;
    const shown = sorted.slice(0, limit);
    const annualByCountry = annualByCountryOf(data);
    const visas = selectedVisaClasses(visa);
    const line = (r: MarketRow, i: number) =>
      `${i + 1}. ${r.country}: ${int(r.periodTotal)} · ${marketChangeText(r)}${
        sort === "10-year"
          ? ` · 10-year ${tenYearTrendText(r.growth10yr, annualByCountry.get(historicalCountryName(r.country)) ?? [], visas, data.meta.coverage.annual.latestComplete)}`
          : ""
      } · ${r.marketCategory}${restrictionTags(r.country)}`;
    const what = {
      nationals: "Largest markets",
      growing: "Fastest-growing markets",
      declining: "Biggest declines",
      "10-year": "Best 10-year trend",
    }[sort];
    const scope = [region !== "All" ? region : null, category !== "All" ? category : null].filter(Boolean).join(", ");
    const title = `${what}, ${vl}${scope ? ` (${scope})` : ""}`;
    const pool = category === "All" ? inScope.length : inScope.filter((r) => r.marketCategory === category).length;
    const lines = shown.length > 0 ? shown.map(line) : ["No markets match these filters."];
    const notes = [
      sort === "growing"
        ? `${sorted.length} of ${pool} markets grew.`
        : sort === "declining"
          ? `${sorted.length} of ${pool} markets fell.`
          : `${shown.length} of ${pool} markets shown.`,
      `Each row: ${byNationality ? "nationals" : "visas issued"} in the last 12 months · change vs the previous 12 months · category.`,
      ...(shown.some((r) => restrictionsFor(r.country).some((x) => x.studentVisasAffected))
        ? ["Countries marked Travel ban or Paused can't currently get student or exchange visas, so their fall reflects the suspension, not ordinary demand."]
        : []),
      ...(byNationality
        ? []
        : ["Monthly nationality data isn't in this data snapshot, so this counts visas by the country where they were issued, as Markets does."]),
    ];
    const measure = `${byNationality ? "nationals" : "visas issued in each country"}, ${vl}, ${min}+ in the last 12 months${scope ? `, ${scope}` : ""}`;
    return result(tool, title, lines, [source("Markets", measure, t.period)], link, { notes });
  },
};

const restrictionsTool: ToolDef = {
  name: "restrictions",
  description: "U.S. visa restrictions: one country's travel ban or pause with its State Department source, or every restricted country.",
  params: { country: { type: "string", description: "Country name (leave out for all)", optional: true } },
  run: (ctx, args) => {
    const tool = "restrictions";
    const src = source("Markets", "visa restriction badges (State Department notices)", `in force when last checked, ${restrictionDate(LAST_CHECKED)}`);
    if (args.country !== undefined && String(args.country).trim()) {
      const found = findCountry(ctx, tool, args.country);
      if ("answer" in found) return found.answer;
      const { country } = found;
      const rs = restrictionsFor(country);
      const link: TabLink = { tab: "country-360", country };
      const countrySrc = { ...src, tab: "Country 360" };
      if (rs.length === 0) {
        return result(tool, `${country}: no visa restriction`, [`No U.S. visa restriction is listed for ${country}.`, lastChecked], [countrySrc], link, { country });
      }
      const lines = rs.flatMap((r) => {
        const [level, history] = restrictionTooltip(r).split("\n");
        return [restrictionBadgeText(r), level, history];
      });
      lines.push(lastChecked);
      return result(tool, `${country}: visa restrictions`, lines, [countrySrc], link, {
        country,
        notes: [RESTRICTION_SMALL_PRINT],
        links: restrictionLinks(rs),
      });
    }
    const names = (keep: (r: Restriction) => boolean) => [...new Set(RESTRICTIONS.filter(keep).map((r) => r.country))].sort();
    const full = names((r) => r.type === "travel-ban" && r.studentVisasAffected && r.level === "full");
    const partial = names((r) => r.type === "travel-ban" && r.studentVisasAffected && r.level === "partial");
    const paused = RESTRICTIONS.filter((r) => r.type === "visa-pause");
    const restored = RESTRICTIONS.filter((r) => r.restored);
    const lines = [
      `Travel ban, full (${full.length}): ${full.join(", ")}.`,
      `Travel ban, partial (${partial.length}): ${partial.join(", ")}.`,
      ...(paused.length > 0
        ? [`Visa services paused (${paused.length}): ${paused.map((r) => r.country).join(", ")}, since ${restrictionDate(paused[0].effective)}${paused[0].reason ? ` (${paused[0].reason})` : ""}.`]
        : []),
      ...restored.map((r) => `${r.country}: ${restrictionBadgeText(r)}.`),
      `Also covered by the travel ban, but not a country in the dashboard: ${RESTRICTED_NON_COUNTRY.join(", ")}.`,
      lastChecked,
    ];
    return result(tool, "Countries with U.S. visa restrictions", lines, [src], { tab: "markets" }, {
      notes: [RESTRICTION_SMALL_PRINT],
      links: restrictionLinks(RESTRICTIONS),
    });
  },
};

/** "20 Mar 2020 — COVID-19 pandemic: …" plus the country's own line on a travel-ban event. */
const eventLine = (e: DashboardEvent, country: string | null): string => {
  const note = countryNote(e, country);
  return `${eventDateText(e)} — ${e.label}: ${e.description}${note ? ` ${note}` : ""}`;
};
const eventLinks = (events: readonly DashboardEvent[]): ExternalLink[] =>
  events.map((e) => ({ label: `${e.label} (${sourceSite(e.source)})`, url: e.source }));
const EVENTS_NOTE = "Events may have affected visa trends; the dashboard doesn't say they caused them.";

/** The calendar (or fiscal) years an event covers. */
function eventYears(e: DashboardEvent, fiscal: boolean): [number, number] {
  const year = (date: string) => (fiscal ? fiscalYearOf(date, e.precision) : Number(date.slice(0, 4)));
  return [year(e.start), year(e.end ?? e.start)];
}

const eventsTool: ToolDef = {
  name: "events",
  description: "Dated, sourced events that may have affected visa trends: a country's own events, the events in a year (2020 or FY2020), or the major global events.",
  params: {
    country: { type: "string", description: "Country name", optional: true },
    year: { type: "string", description: "A year, e.g. 2020 (calendar) or FY2020 (fiscal)", optional: true },
  },
  run: (ctx, args) => {
    const tool = "events";
    const checked = `last checked ${restrictionDate(EVENTS_LAST_CHECKED)}`;
    let country: string | null = null;
    if (args.country !== undefined && String(args.country).trim()) {
      const found = findCountry(ctx, tool, args.country);
      if ("answer" in found) return found.answer;
      country = found.country;
    }
    const yearText = args.year === undefined ? "" : String(args.year).trim();
    if (yearText) {
      const m = /^(fy\s*)?(\d{4})$/i.exec(yearText);
      if (!m) {
        return { tool, status: "unknown", title: `I don't know the year "${yearText}"`, lines: ["Give a year like 2020, or FY2020 for a fiscal year."], sources: [source("Historical Trends", "events timeline", checked)], link: null };
      }
      const fiscal = m[1] !== undefined;
      const y = Number(m[2]);
      const pool = country ? selectEvents({ country, globalDetail: true }) : EVENTS;
      const inYear = pool.filter((e) => {
        const [a, b] = eventYears(e, fiscal);
        return a <= y && y <= b;
      });
      const label = `${fiscal ? "FY" : ""}${y}`;
      return result(
        tool,
        `Events in ${label}${country ? ` (${country})` : ""}`,
        inYear.length > 0 ? inYear.map((e) => eventLine(e, country)) : [`No events on the dashboard's timeline in ${label}${country ? ` for ${country}` : ""}.`],
        [source(country ? "Country 360" : "Historical Trends", "events timeline (dated, sourced)", `${label}, ${checked}`)],
        country ? { tab: "country-360", country } : { tab: "historical-trends" },
        { country: country ?? undefined, notes: [EVENTS_NOTE], links: eventLinks(inYear) },
      );
    }
    if (country) {
      const own = EVENTS.filter((e) => e.scope !== "global" && e.scope.includes(country!));
      const global = EVENTS.filter((e) => e.scope === "global");
      const lines = own.length > 0 ? own.map((e) => eventLine(e, country)) : [`No events specific to ${country} on the dashboard's timeline.`];
      lines.push(`${country}'s charts also show the ${global.length} global events (ask about a year to see them).`);
      return result(tool, `Events for ${country}`, lines, [source("Country 360", "events timeline (dated, sourced)", checked)], { tab: "country-360", country }, {
        country,
        notes: [EVENTS_NOTE],
        links: eventLinks(own),
      });
    }
    const major = EVENTS.filter((e) => e.scope === "global" && e.importance === "major");
    return result(tool, "Major global events", major.map((e) => eventLine(e, null)), [source("Historical Trends", "events timeline (dated, sourced)", checked)], { tab: "historical-trends" }, {
      notes: [EVENTS_NOTE],
      links: eventLinks(major),
    });
  },
};

const marketCycles: ToolDef = {
  name: "market_cycles",
  description: "Market cycles: world downturns and whether they recovered, the recovery summary (F1), the latest signal, and optionally one country's downturns and history.",
  params: {
    country: { type: "string", description: "Country name (optional)", optional: true },
    visa: { type: "string", description: "F1, J1 or Both", options: ["F1", "J1", "Both"], optional: true },
  },
  run: (ctx, args) => {
    const { data } = ctx;
    const tool = "market_cycles";
    if (data.annualCountry.length === 0) return tableMissing(tool, "annual nationality table");
    let country: string | null = null;
    if (args.country !== undefined && String(args.country).trim()) {
      const found = findCountry(ctx, tool, args.country);
      if ("answer" in found) return found.answer;
      country = found.country;
    }
    const visa = visaArg(ctx, args.visa);
    const vl = visaLabel(visa);
    const visas = selectedVisaClasses(visa);
    const fy = fiscalSpan(data);
    const fyText = (year: number) => `FY${year}${fy.provisional.has(year) ? " (provisional)" : ""}`;
    const notYet = notYetText(fy.last, fy.lastIsProvisional);
    const downturnLine = (series: string, d: Parameters<typeof downturnCells>[0]) => {
      const c = downturnCells(d, fyText, notYet);
      const regained = c.regained.startsWith("Not yet") ? `not yet${c.regained.slice(7)}` : c.regained;
      return `${series}: peak ${c.peak} → low ${c.trough}, ${c.depth}; rebound within 3 years ${c.rebound}; regained ${regained}`;
    };
    const lines = memo(data, `world:${visa}`, () => {
      const w = worldSeries(data.annualCountry, visas, fy.first, fy.last);
      return [
        ...findDownturns(w.world).map((d) => downturnLine("World", d)),
        ...findDownturns(w.excludingChina).map((d) => downturnLine("World excluding mainland China", d)),
      ];
    }).slice();
    lines.push(`Recovery summary (always F1): ${memo(data, "summaryText", () => recoverySummaryText(recoverySummary(seriesByCountry(data.annualCountry, ["F1"], fy.first, fy.last)), fy.first))}`);
    const notes: string[] = [];
    if (data.nationalityMonthly) {
      const signal = latestSignal(data.nationalityMonthly, visas, data.meta.coverage.postsMonthly.end);
      lines.push(`Latest signal (${vl}): ${latestSignalText(signal)}`, `Latest 3 months vs a year earlier: ${latestMonthsText(signal)}.`);
    } else {
      notes.push("The latest signal isn't available yet: it needs the monthly nationality data, which isn't in this data snapshot.");
    }
    if (country) {
      const series = fiscalYearSeries(data.annualCountry.filter((r) => r.country === country), visas, fy.first, fy.last);
      const view = countryDownturnView(country, series);
      const history = historyLabel(declineHistory(country, fiscalYearSeries(data.annualCountry.filter((r) => r.country === country), ["F1"], fy.first, fy.last)), fy.provisional);
      lines.push(`${country} — History (F1): ${historyLineText(history)}`);
      if (view.kind === "rows") {
        lines.push(
          ...(view.rows.length > 0
            ? view.rows.map((d) => downturnLine(country!, d))
            : [`No 20%+ downturn from a peak of ${MIN_BASE}+ for ${country} since FY${fy.first}.`]),
        );
      } else {
        lines.push(countryDownturnNote(country, view, visaWords(visas)) ?? "");
      }
      notes.push(historyNote(visas, fy.provisional, fy.last));
    }
    return result(
      tool,
      country ? `Market cycles: ${country} and the world (${vl})` : `Market cycles: the world (${vl})`,
      lines,
      [source("Historical Trends", `Market cycles, ${vl} by nationality, all countries`, fy.label)],
      { tab: "historical-trends", visa, ...(country ? { country } : {}) },
      { country: country ?? undefined, notes },
    );
  },
};

const countryVsWorldTool: ToolDef = {
  name: "country_vs_world",
  description: "A country compared with the world: last year's change and the change since FY2019, in one sentence (Market cycles).",
  params: {
    country: { type: "string", description: "Country name" },
    visa: { type: "string", description: "F1, J1 or Both", options: ["F1", "J1", "Both"], optional: true },
  },
  run: (ctx, args) => {
    const { data } = ctx;
    const tool = "country_vs_world";
    if (data.annualCountry.length === 0) return tableMissing(tool, "annual nationality table");
    const found = findCountry(ctx, tool, args.country);
    if ("answer" in found) return found.answer;
    const { country } = found;
    const visa = visaArg(ctx, args.visa);
    const vl = visaLabel(visa);
    const visas = selectedVisaClasses(visa);
    const fy = fiscalSpan(data);
    const link: TabLink = { tab: "historical-trends", country, visa };
    const src = source("Historical Trends", `Market cycles → ${country} compared with the world, ${vl} by nationality`, `FY${INDEX_BASE_YEAR}–FY${fy.last}${fy.lastIsProvisional ? ` (FY${fy.last} provisional)` : ""}`);
    const split = COUNTRY_SPLITS[country];
    if (split) {
      return notInData(tool, `${country} vs the world`, `${country} split in ${split.year}; compare ${split.successors.join(" or ")} with the world instead.`, [src], link, { country });
    }
    const series = fiscalYearSeries(data.annualCountry.filter((r) => r.country === country), visas, fy.first, fy.last);
    if (!series.some((p) => p.value > 0)) {
      return notInData(tool, `${country} vs the world`, `No ${visaWords(visas)} visas for ${country} in the annual data.`, [src], link, { country });
    }
    const world = memo(data, `world:${visa}:series`, () => worldSeries(data.annualCountry, visas, fy.first, fy.last).world);
    const vs = countryVsWorld(country, series, world, { visaWords: visaWords(visas), latestProvisional: fy.lastIsProvisional });
    return result(tool, `${country} vs the world (${vl})`, [vs.sentence], [src], link, { country });
  },
};

const historyLabelTool: ToolDef = {
  name: "history_label",
  description: "A country's history label (Structural, Gradual, Cyclical or Too early to tell) and its evidence, always from F1.",
  params: { country: { type: "string", description: "Country name" } },
  run: (ctx, args) => {
    const { data } = ctx;
    const tool = "history_label";
    if (data.annualCountry.length === 0) return tableMissing(tool, "annual nationality table");
    const found = findCountry(ctx, tool, args.country);
    if ("answer" in found) return found.answer;
    const { country } = found;
    const fy = fiscalSpan(data);
    const h = marketHistory(country, historiesOf(data), fy.provisional);
    return result(
      tool,
      `${country}: history (F1)`,
      [`History (F1): ${historyLineText(h)}`],
      [source("Markets", "History (F1) column (also Historical Trends → Market cycles)", `FY${fy.first}–FY${fy.last}`)],
      { tab: "historical-trends", country },
      { country, notes: [historyNote(["F1"], fy.provisional, fy.last)] },
    );
  },
};

const CONSULATE_ROWS = 10;

const consulatesTool: ToolDef = {
  name: "consulates",
  description: "Where a country's visas are issued: its U.S. consulates in the last 12 months, with share, change and recovery.",
  params: {
    country: { type: "string", description: "Country name" },
    visa: { type: "string", description: "F1, J1 or Both", options: ["F1", "J1", "Both"], optional: true },
  },
  run: (ctx, args) => {
    const { data } = ctx;
    const tool = "consulates";
    if (data.postsMonthly.length === 0) return tableMissing(tool, "monthly consulate table");
    const found = findCountry(ctx, tool, args.country);
    if ("answer" in found) return found.answer;
    const { country } = found;
    const visa = visaArg(ctx, args.visa);
    const vl = visaLabel(visa);
    const visas = selectedVisaClasses(visa);
    const t = twelveMonths(data);
    const coverage = data.meta.coverage.postsMonthly;
    const link: TabLink = { tab: "consulates", country, visa, period: "last12", params: { scope: "country" } };
    const src = source("Consulates", `visas issued at U.S. consulates in ${country}, ${vl}`, t.period);
    const notes = consulateScopeNotes(country, consulateStatus(data.postsMonthly, country, coverage.end));
    const hasPosts = memo(data, "consulateCountries", () => new Set(data.postsMonthly.map((r) => r.country))).has(country);
    if (!hasPosts) {
      return result(tool, `Consulates in ${country}`, [`No consulate data for ${country}: the monthly consulate data has no posts in this country.`], [src], link, { country, notes });
    }
    const visaRows = memo(data, `postRows:${visa}`, () => data.postsMonthly.filter((r) => visas.includes(r.visa)));
    const recoveryYear = recoveryYearOf(coverage);
    const table = buildConsulateTable(visaRows, t.range, t.prior, country, recoveryYear);
    const lines: string[] = [];
    const context = consulateContext(data.postsMonthly, data.nationalityMonthly, country, t.range, visas);
    if (context) {
      lines.push(`Consulates in ${country} issued ${int(context.issuedIn)} ${vl} visas in the last 12 months; nationals of ${country} received ${int(context.receivedBy)} ${vl} visas worldwide.`);
    } else if (!data.nationalityMonthly) {
      notes.push(`How many ${vl} visas nationals of ${country} received worldwide isn't available yet: it needs the monthly nationality data, which isn't in this data snapshot.`);
    }
    const paused = (post: string) => {
      const text = pausedPostText(post);
      return text ? ` · ${text}` : "";
    };
    if (table.reduce((sum, r) => sum + r.volume, 0) === 0) {
      const dormant = dormantConsulates(visaRows, data.postsMonthly, t.range, t.prior, country, recoveryYear);
      const otherVisa = visas.length === 1 ? (visas[0] === "F1" ? "J1" : "F1") : null;
      if (dormant.length > 0) {
        lines.push(noIssuanceNotice(dormant, country, visas, { ...t.range, inSentence: `the last 12 months (${t.label})` }, coverage.start));
        lines.push(...dormant.map((r) => `${r.post}: 0 · last ${vl} issuance ${lastIssuanceText(r, otherVisa)}${paused(r.post)}`));
      } else {
        lines.push(`No ${vl} consulate issuances in ${country} in the last 12 months.`);
      }
    } else {
      lines.push(
        ...table
          .slice(0, CONSULATE_ROWS)
          .map(
            (r) =>
              `${r.post}: ${int(r.volume)} · ${pct1(r.share)}% of ${country} · ${consulateChangeText(r)} vs the previous 12 months · recovery ${consulateRecoveryText(r.recovery, recoveryYear)}${paused(r.post)}`,
          ),
      );
      if (table.length > CONSULATE_ROWS) notes.push(`The top ${CONSULATE_ROWS} of ${table.length} consulates.`);
      notes.push(`Recovery: ${recoveryYear ?? "the latest complete year"} vs 2019, 100 = the 2019 level.`);
    }
    return result(tool, `Consulates in ${country}, ${vl}`, lines, [src], link, { country, notes });
  },
};

const definitionTool: ToolDef = {
  name: "definition",
  description: "What a dashboard term means (categories, low volume, provisional, history labels, travel ban…).",
  params: { term: { type: "string", description: "The term" } },
  run: (_ctx, args) => {
    const tool = "definition";
    const raw = args.term === undefined ? "" : String(args.term);
    const key = normalize(raw);
    const matches = (d: (typeof DEFINITIONS)[number]) => [d.term, ...d.aliases].map(normalize);
    const def =
      DEFINITIONS.find((d) => matches(d).includes(key)) ??
      (key.length >= 3 ? DEFINITIONS.find((d) => matches(d).some((a) => a.length >= 3 && (key.includes(a) || a.includes(key)))) : undefined);
    if (!def) {
      return {
        tool,
        status: "unknown",
        title: raw ? `I don't know "${raw}"` : "Which term?",
        lines: [`I don't know — the dashboard doesn't define "${raw}". Terms I can explain: ${DEFINITIONS.map((d) => d.term).join(", ")}.`],
        sources: [source("Dashboard", "definitions", "the dashboard's number rules")],
        link: null,
        suggestions: DEFINITIONS.map((d) => d.term),
      };
    }
    return result(tool, def.term, [def.text], [source(TAB_LABELS[def.tab], "definition", "the dashboard's number rules")], { tab: def.tab });
  },
};

/** Every tool, in the order the plan lists them. */
export const TOOLS: readonly ToolDef[] = [
  dataCoverage,
  countryOverview,
  countryTrend,
  listMarkets,
  restrictionsTool,
  eventsTool,
  marketCycles,
  countryVsWorldTool,
  historyLabelTool,
  consulatesTool,
  definitionTool,
];

export const toolByName = (name: string): ToolDef | undefined => TOOLS.find((t) => t.name === name);

/** Runs a tool; an unexpected failure becomes a plain "can't answer" result, never a crash. */
export function runTool(name: string, ctx: ToolContext, args: Record<string, string | number | undefined> = {}): ToolResult {
  const tool = toolByName(name);
  if (!tool) {
    return { tool: name, status: "unknown", title: `No tool called "${name}"`, lines: [`Tools: ${TOOLS.map((t) => t.name).join(", ")}.`], sources: [DATA_SOURCE], link: null };
  }
  try {
    return tool.run(ctx, args);
  } catch {
    return {
      tool: name,
      status: "error",
      title: "I can't answer that right now",
      lines: ["Something went wrong reading the dashboard's data, so I won't guess. The tabs still show the figures."],
      sources: [DATA_SOURCE],
      link: null,
    };
  }
}

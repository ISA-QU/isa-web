/**
 * Plain-language definitions of the dashboard's terms, for the Bobcat's
 * definition tool and (later) the user guide. User-facing wording only: the
 * rules come from docs/dashboard.md ("Shared number rules"), and thresholds are
 * read from the code so the text can't drift from the rules. Each entry names a
 * phrase from docs/dashboard.md; the verify script checks every phrase is
 * still there, so a rule renamed in the docs shows up as a failed check.
 */

import { DOWNTURN_SHARE, GRADUAL_SHARE, INDEX_NOTE, IN_LINE_POINTS, LONG_DECLINE_YEARS, MAJOR_MARKET_MIN, REBOUND_YEARS, STRUCTURAL_SHARE } from "../cycles";
import { MIN_BASE } from "../measures";
import { MARKET_THRESHOLDS as T } from "../metrics";
import { RESTRICTIONS, restrictionDate } from "../restrictions";
import type { TabId } from "./types";

export interface Definition {
  id: string;
  term: string;
  /** Other words people use for it (normalized when matched). */
  aliases: readonly string[];
  text: string;
  /** The tab where the term shows. */
  tab: TabId;
  /** A phrase that must appear in docs/dashboard.md (whitespace-insensitive). */
  docPhrase: string;
}

const n = (value: number) => value.toLocaleString("en-US");
const pctOf = (share: number) => `${Math.round(share * 100)}%`;
const pausedCountries = [...new Set(RESTRICTIONS.filter((r) => r.type === "visa-pause").map((r) => r.country))];
const pauseSince = RESTRICTIONS.find((r) => r.type === "visa-pause")?.effective;

export const DEFINITIONS: readonly Definition[] = [
  {
    id: "last-12-months",
    term: "Last 12 months",
    aliases: ["last 12 months", "last twelve months", "previous 12 months", "l12", "rolling 12 months"],
    text: "The 12 months ending at the data's last month, the same for every country and consulate. \"Previous 12 months\" is the 12 months before that.",
    tab: "markets",
    docPhrase: "\"Last 12 months\" always ends at the data's last month",
  },
  {
    id: "nationals",
    term: "Nationals (by nationality)",
    aliases: ["nationals", "nationality", "by nationality", "passport"],
    text: "Visas counted by the passport they were issued to, wherever in the world they were issued. Markets and Country 360 lead with this measure.",
    tab: "country-360",
    docPhrase: "the passport the visa was issued to",
  },
  {
    id: "issued-in",
    term: "Issued in",
    aliases: ["issued in", "where issued", "consulate data", "by consulate"],
    text: "Visas counted by the U.S. consulate that issued them, in that country. A country's nationals can also get visas elsewhere, so this differs from nationals. Consulates uses this measure.",
    tab: "consulates",
    docPhrase: "\"Issued in [country]\" (its U.S. consulates)",
  },
  {
    id: "visas",
    term: "F1 and J1",
    aliases: ["f1", "j1", "f 1", "j 1", "student visa", "exchange visa", "exchange visitor", "visa types", "visa control"],
    text: "F1 is the student visa; J1 is the exchange visitor visa. The Visa control switches the dashboard between F1, J1 and F1 + J1.",
    tab: "markets",
    docPhrase: "one set for F1, J1 and Both",
  },
  {
    id: "fiscal-year",
    term: "Fiscal year (FY)",
    aliases: ["fiscal year", "fy", "federal fiscal year"],
    text: "The U.S. government year, October to September: FY2025 is Oct 2024 – Sep 2025.",
    tab: "historical-trends",
    docPhrase: "Oct–Sep year",
  },
  {
    id: "provisional",
    term: "Provisional",
    aliases: ["provisional", "preliminary"],
    text: "The latest complete fiscal year is summed from the monthly reports, which the State Department notes shouldn't simply be added up for annual totals; official annual figures will replace it.",
    tab: "historical-trends",
    docPhrase: "provisional and hollow-marked",
  },
  {
    id: "low-volume",
    term: "— (low volume)",
    aliases: ["low volume", "minimum base", "too few", "dash"],
    text: `A % change is shown only when the earlier figure (the previous period, or the base year) had at least ${MIN_BASE} visas; otherwise the dashboard shows "— (low volume)", because a % of a tiny number says little.`,
    tab: "markets",
    docPhrase: "Minimum base of 100",
  },
  {
    id: "change",
    term: "Change vs previous 12 months",
    aliases: ["change", "momentum", "growth rate", "percent change", "year over year"],
    text: "The last 12 months against the 12 months before, as a %. ▲ is up, ▼ is down.",
    tab: "markets",
    docPhrase: "change vs the previous equal-length period",
  },
  {
    id: "recovery",
    term: "Recovery index",
    aliases: ["recovery index", "recovery", "vs 2019", "2019 level"],
    text: `The latest complete calendar year as a share of 2019, the last year before COVID: 100 is the 2019 level, 80 means 20% below it. Shown only when 2019 had at least ${MIN_BASE} visas.`,
    tab: "markets",
    docPhrase: "recovery index (latest complete year vs 2019)",
  },
  {
    id: "trend",
    term: "10-year and 5-year trend",
    aliases: ["10 year trend", "ten year trend", "5 year trend", "five year trend", "long term trend", "trend"],
    text: `The % change in visas by nationality from the fiscal year 10 (or 5) years before the latest complete one. "— (low volume)" when that earlier year had under ${MIN_BASE}.`,
    tab: "markets",
    docPhrase: "10-year trend",
  },
  {
    id: "categories",
    term: "Market categories",
    aliases: ["category", "categories", "core", "growth", "emerging", "recovery market", "watch", "declining", "restricted"],
    text:
      "Checked in this order. Restricted: student and exchange visas blocked by a travel ban or a pause of visa services. " +
      `Core: ${n(T.core)}+ in the last 12 months and not structurally declining. ` +
      `Declining: 10-year trend ${T.structuralGrowth}% or worse and last-12-month change ${T.structuralMomentum}% or worse, with ${T.declineMinPrior}+ in the previous 12 months (also a market that fell below ${MIN_BASE} from ${MIN_BASE}+). ` +
      `Emerging: change +${T.emergingMomentum}% or more with ${T.emergingMin}–${n(T.core - 1)} in the last 12 months. ` +
      `Growth: 10-year trend +${T.growthTenYear}% or more with ${T.growthMin}+. ` +
      `Recovery: recovery index ${T.recoveryIndex}+ with ${T.recoveryMin}+. Watch: everything else.`,
    tab: "markets",
    docPhrase: "Core 5,000+ in the last 12 months",
  },
  {
    id: "peak-month",
    term: "Peak month (typical year)",
    aliases: ["peak month", "typical year", "seasonality", "best month", "timing"],
    text: "The calendar month with the most visas on average over the typical years (complete years except 2020–2021), counting missing months as 0. Timing advice is built from it.",
    tab: "country-360",
    docPhrase: "Peak month (typical year)",
  },
  {
    id: "downturn",
    term: "Downturn",
    aliases: ["downturn", "downturns", "market cycle", "market cycles", "rebound", "regained"],
    text: `A downturn starts when a fiscal year is ${Math.round((1 - DOWNTURN_SHARE) * 100)}%+ below the highest year so far and ends when that peak is regained. Rebound: the best year within ${REBOUND_YEARS} years of the low, vs the low.`,
    tab: "historical-trends",
    docPhrase: "Downturn rule: a year 20%+ below the highest year so far",
  },
  {
    id: "history-labels",
    term: "History labels",
    aliases: ["history label", "history", "structural", "gradual", "cyclical", "too early to tell", "too early"],
    text:
      "Background only, from each country's F1 history; they don't change the category or the advice. " +
      `Structural — long decline: the peak is ${LONG_DECLINE_YEARS}+ years old and the latest year is under ${pctOf(STRUCTURAL_SHARE)} of it. ` +
      `Gradual long decline: the same, at ${pctOf(STRUCTURAL_SHARE)}–${pctOf(GRADUAL_SHARE)}. ` +
      `Cyclical — has recovered before: an earlier ${Math.round((1 - DOWNTURN_SHARE) * 100)}%+ downturn regained its peak. ` +
      `Too early to tell: a best F1 year under ${MAJOR_MARKET_MIN}, or none of these.`,
    tab: "markets",
    docPhrase: "History labels (2b-2)",
  },
  {
    id: "vs-world",
    term: "Country vs world",
    aliases: ["vs world", "compared with the world", "index", "fy2019 100", "share of world", "in line with the market"],
    text: `${INDEX_NOTE} "About in line with the market" means within ${IN_LINE_POINTS} percentage points of the world.`,
    tab: "historical-trends",
    docPhrase: "indexed to FY2019 = 100",
  },
  {
    id: "travel-ban",
    term: "Travel ban",
    aliases: ["travel ban", "ban", "proclamation", "suspended", "suspension", "10949", "10998", "full suspension", "partial suspension"],
    text:
      "Presidential Proclamations 10949 (from 9 Jun 2025) and 10998 (from 1 Jan 2026) suspend student and exchange (F, M, J) visas for listed nationals. " +
      "Full: all visas; partial: B-1/B-2 and F, M, J visas. Visas issued before the effective date are not revoked. Information only, not legal advice: check the State Department source.",
    tab: "markets",
    docPhrase: "Proclamation 10998 (1 Jan 2026) continued Proclamation 10949",
  },
  {
    id: "paused",
    term: "Paused (visa services)",
    aliases: ["paused", "pause", "visa pause", "temporary pause", "ebola"],
    text: `A temporary pause of all U.S. visa services in a country, for every nationality${
      pausedCountries.length > 0 && pauseSince ? ` (${pausedCountries.join(", ")} since ${restrictionDate(pauseSince)})` : ""
    }. Pauses may lift without notice.`,
    tab: "consulates",
    docPhrase: "temporary pause of all visa services",
  },
  {
    id: "latest-signal",
    term: "Latest signal",
    aliases: ["latest signal", "bottom", "no sign of a bottom", "narrowing"],
    text: "The fiscal year so far against the same months a year earlier, from the monthly nationality data. \"No sign of a bottom yet\" while each of the latest 3 months is 20%+ below a year earlier; otherwise \"the decline is narrowing\".",
    tab: "historical-trends",
    docPhrase: "\"no sign of a bottom yet\" while each of the latest 3 months is 20%+ below a year earlier",
  },
];

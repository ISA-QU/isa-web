/**
 * How to use the dashboard, in plain words: one entry per tab, control and
 * badge. The Bobcat's "how do I / where can I" answers and its tour read these,
 * and a user guide can reuse the same wording. Each answer is one or two
 * sentences and names the tab its "Open tab" button goes to.
 */

import { PAUSED_POSTS, RESTRICTIONS, restrictionDate } from "../restrictions";
import { TAB_LABELS, type TabId } from "./types";

export interface NavTopic {
  id: string;
  title: string;
  /** Words that point to this topic (normalized; longer phrases win). */
  keywords: readonly string[];
  text: string;
  tab: TabId;
}

const pauses = RESTRICTIONS.filter((r) => r.type === "visa-pause");
const pausedCountries = pauses.map((r) => r.country.replace("Democratic Republic of the Congo", "DR Congo"));
const pausedSince = pauses[0] ? ` since ${restrictionDate(pauses[0].effective)}` : "";

export const NAV_TOPICS: readonly NavTopic[] = [
  {
    id: "markets",
    title: "Markets tab",
    keywords: ["markets tab", "markets page", "markets", "market list", "all countries", "rankings table"],
    text: "Markets lists every country by nationality with its category, what to do and timing. Narrow it with Region, Category, Sort by and the minimum-nationals slider; More details has every column.",
    tab: "markets",
  },
  {
    id: "executive",
    title: "Executive tab",
    keywords: ["executive tab", "executive", "globe", "world map", "map"],
    text: "Executive has the interactive globe (drag to rotate, hover a country for its F1 and J1 totals) with a focus card for the selected country, plus yearly and monthly charts.",
    tab: "executive",
  },
  {
    id: "country-360",
    title: "Country 360 tab",
    keywords: ["country 360", "country360", "country page", "one country", "what to do"],
    text: "Country 360 covers one country in depth: its nationals in the last 12 months, the monthly trend, the long-term trajectory and What to do. It follows the Country control at the top.",
    tab: "country-360",
  },
  {
    id: "consulates",
    title: "Consulates tab",
    keywords: ["consulates tab", "consulates page", "consulates", "consulate", "embassy", "embassies", "posts"],
    text: "Consulates ranks the U.S. consulates that issued the visas, for the selected country or all countries (the Scope switch), with change, share and recovery; pick a consulate for its detail.",
    tab: "consulates",
  },
  {
    id: "historical-trends",
    title: "Historical Trends tab",
    keywords: ["historical trends", "historical", "history tab", "30 years", "long term", "market cycles", "growing markets", "declining markets"],
    text: "Historical Trends shows 30 years of annual visas by nationality: the country cards, Market cycles (downturns and recoveries, and the country compared with the world) and the growing and declining rankings.",
    tab: "historical-trends",
  },
  {
    id: "country-control",
    title: "Choosing a country",
    keywords: ["country control", "change country", "change the country", "select a country", "select country", "pick a country", "choose a country", "switch country", "reset to defaults", "reset"],
    text: "The Country control at the top sets the country every tab follows; type to search. Reset to defaults goes back to India, F1 and the last 12 months.",
    tab: "country-360",
  },
  {
    id: "visa-control",
    title: "The Visa control",
    keywords: ["visa control", "change visa", "change the visa", "switch visa", "visa filter", "visa type", "switch to j1", "change to j1", "see j1", "see f1", "f1 and j1", "f1 j1"],
    text: "The Visa control at the top switches the tabs between F1 (students), J1 (exchange visitors) and F1 + J1.",
    tab: "markets",
  },
  {
    id: "period-control",
    title: "The Period control",
    keywords: ["period control", "period", "date range", "time range", "time period", "change the months", "calendar year", "custom months", "last 24 months", "fiscal year range"],
    text: "The Period control at the top sets the months for figures marked \"Follows Period\": the last 12 or 24 months, a calendar year, custom months, all data or 2019–2022. On Historical Trends it becomes a fiscal-year range.",
    tab: "markets",
  },
  {
    id: "show-events",
    title: "Show events",
    keywords: ["show events", "events on the chart", "events on charts", "event markers", "event lines", "diamond", "hide events", "turn off events", "events"],
    text: "Tick Show events above a chart to draw dated events (travel bans, COVID and others) on it; hover a ◆ for the details and source. One setting covers every chart.",
    tab: "historical-trends",
  },
  {
    id: "csv",
    title: "CSV downloads",
    keywords: ["csv", "download", "downloads", "export", "excel", "spreadsheet", "save the table"],
    text: "Tables have a Download … CSV button under them (Markets, Consulates, Historical Trends, and Country 360's Downloads section); it saves the rows the table shows with your filters.",
    tab: "markets",
  },
  {
    id: "travel-ban-badge",
    title: "Travel ban badge",
    keywords: ["travel ban badge", "ban badge", "red badge", "amber badge", "grey badge", "restored badge", "badge", "badges"],
    text: "A red (full) or amber (partial) Travel ban badge means the country's student and exchange visas are suspended; grey means they aren't affected (restored, immigrant visas only). Hover a badge for the proclamation, its source and when it was last checked.",
    tab: "markets",
  },
  {
    id: "paused-badge",
    title: "Paused badge",
    keywords: ["paused badge", "purple badge", "paused", "pause badge"],
    text: `A purple Paused badge means all U.S. visa services are paused in that country (${pausedCountries.join(", ")}${pausedSince}); on Consulates it shows on the ${Object.keys(PAUSED_POSTS).join(", ")} rows.`,
    tab: "consulates",
  },
  {
    id: "low-volume",
    title: "— (low volume)",
    keywords: ["low volume", "dash", "why a dash", "why is there a dash", "no percentage"],
    text: "\"— (low volume)\" appears where the earlier figure had fewer than 100 visas, because a % change of a tiny number says little.",
    tab: "markets",
  },
  {
    id: "provisional",
    title: "Provisional years",
    keywords: ["provisional", "hollow marker", "hollow markers", "hollow dot", "hollow"],
    text: "Provisional marks the latest complete fiscal year, drawn with hollow markers on the yearly charts: it's summed from the monthly reports until official annual figures replace it.",
    tab: "historical-trends",
  },
  {
    id: "history-labels",
    title: "History labels",
    keywords: ["history label", "history labels", "history column", "history f1", "structural label", "cyclical label"],
    text: "Each country's history label (Structural, Gradual, Cyclical or Too early to tell) is in Markets' History (F1) column (hover it for the evidence), under What to do on Country 360, and in Historical Trends → Market cycles.",
    tab: "markets",
  },
  {
    id: "compare",
    title: "Comparing countries",
    keywords: ["compare countries", "compare", "comparison", "side by side"],
    text: "Country 360's Compare countries chart shows the top five markets by default; pick up to eight in its picker. Historical Trends → Market cycles compares the selected country with the world.",
    tab: "country-360",
  },
];

/** The tour: one line per tab, each with an Open button. */
export const TOUR: readonly { tab: TabId; line: string }[] = [
  { tab: "markets", line: "Markets: every country ranked, with its category, what to do and timing." },
  { tab: "executive", line: "Executive: the interactive globe and the headline charts." },
  { tab: "country-360", line: "Country 360: one country in depth, ending with What to do." },
  { tab: "consulates", line: "Consulates: where the visas are issued, consulate by consulate." },
  { tab: "historical-trends", line: "Historical Trends: 30 years by nationality, with market cycles." },
];

export const TOUR_INTRO = "I answer questions from this dashboard's data. Here's what each tab is for:";

export const tabLabel = (tab: TabId): string => TAB_LABELS[tab];

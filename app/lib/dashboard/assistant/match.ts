/**
 * Understands a question without AI: finds the countries (names, other names,
 * nationality words), the visa, region, category, year, list size and what is
 * being asked (the intent), from keyword lists. Pure, so the verify script runs
 * the sample questions (samples.ts) through it. To support a new kind of
 * question, add its words to INTENT_WORDS and its tools in answer.ts.
 */

import { MARKET_CATEGORIES } from "../constants";
import type { VisaSelection } from "../types";
import { findPlaces, normalize } from "./countries";
import { DEFINITIONS, type Definition } from "./definitions";
import { NAV_TOPICS, type NavTopic } from "./navigation";

export type Intent =
  | "summary" // one country, no intent: overview + trend + history + vs world
  | "overview"
  | "trend"
  | "list"
  | "restrictions"
  | "events"
  | "history"
  | "vs_world"
  | "cycles"
  | "consulates"
  | "definition"
  | "coverage"
  | "navigation"
  | "tour"
  | "special"
  | "united_states"
  | "ambiguous"
  | "greeting"
  | "thanks"
  | "out_of_scope"
  | "forecast"
  | "unknown";

export type ListSort = "nationals" | "growing" | "declining" | "10-year";
export type OutOfScope = "applicants" | "writing" | "legal" | "other";

export interface Question {
  text: string;
  intent: Intent;
  countries: string[];
  special: string | null;
  ambiguous: { word: string; options: readonly string[] } | null;
  region: string | null;
  visa: VisaSelection | null;
  year: { year: number; fiscal: boolean } | null;
  sort: ListSort | null;
  category: string | null;
  limit: number | null;
  definition: Definition | null;
  navTopic: NavTopic | null;
  /** The United States was named (as a nationality, not as the visa issuer). */
  mentionsUS: boolean;
  /** "we", "our", "us": the data is U.S.-wide, not Quinnipiac's own. */
  weUs: boolean;
  /** "And China?", "What about J1?": reuse the previous question's intent. */
  followUp: boolean;
  outOfScope: OutOfScope | null;
}

/** The words behind each intent (normalized, whole words; longer phrases are fine). */
export const INTENT_WORDS = {
  restrictions: ["travel ban", "travel bans", "ban", "bans", "banned", "restricted", "restriction", "restrictions", "suspended", "suspension", "suspensions", "proclamation", "paused", "pause", "blocked"],
  events: ["what happened", "happened", "event", "events", "why did", "why has", "why have", "what caused", "caused", "cause of", "covid", "9 11", "september 11"],
  consulates: ["consulate", "consulates", "embassy", "embassies", "post", "posts", "issued in", "which cities", "which city", "interview"],
  vsWorld: ["compare with the world", "compared with the world", "compared to the world", "vs the world", "versus the world", "against the world", "the world", "world", "rest of the world", "the market", "overall market", "ahead of the market", "behind the market", "outperform", "underperform", "relative"],
  compare: ["compare", "compared", "comparison", "versus", "vs"],
  history: ["history", "historically", "structural", "cyclical", "gradual", "recovered before", "recover before", "come back", "comes back", "bounce back", "bounced back", "comeback", "track record", "past downturns", "recovered in the past"],
  cycles: ["downturn", "downturns", "cycle", "cycles", "market cycles", "recession", "bottom", "slump", "crash", "rebound", "recovery summary", "low point", "recovering", "recover"],
  trend: ["trend", "trends", "long term", "over time", "10 year", "ten year", "5 year", "five year", "since 2019", "pre pandemic", "peak", "cagr", "growth", "growing", "grew", "grow", "trajectory", "over the years", "decade", "annual", "yearly", "declining", "decline", "falling", "fell", "dropping", "dropped"],
  timing: ["peak month", "timing", "when to travel", "best month", "outreach window", "when should we travel", "what to do", "advice", "category"],
  overview: ["doing", "how is", "how are", "how s", "overview", "last 12 months", "past year", "numbers", "figures", "what to do", "advice", "recommend", "recommendation", "category", "how many", "status", "performance", "performing", "outlook", "focus", "priority", "timing", "peak month", "when to travel", "outreach"],
  coverage: ["how recent", "up to date", "data through", "latest data", "latest month", "last updated", "how old", "data cover", "coverage", "which months", "how current", "when does the data", "what period", "final", "provisional"],
  definitionTriggers: ["what does", "what do you mean", "mean", "means", "meaning", "define", "definition", "what is meant", "explain", "what is", "what are", "what s"],
  strongDefinition: ["mean", "means", "meaning", "define", "definition", "what is meant"],
  nav: ["how do i", "how can i", "how to", "where can i", "where do i", "where is", "where are", "where s", "which tab", "what tab", "show me how", "take me to", "go to", "open the", "navigate", "find the", "can i see", "can i find", "how do you"],
  tour: ["what can you do", "what can i ask", "what do you do", "show me around", "tour", "help", "how does this work", "how do you work", "get started", "guide me", "who are you", "what are you"],
  greeting: ["hi", "hello", "hey", "hiya", "good morning", "good afternoon", "good evening", "namaste", "hola", "bonjour", "greetings"],
  thanks: ["thanks", "thank you", "thank u", "cheers", "great", "awesome", "perfect", "ok", "okay", "cool", "nice"],
  growing: ["growing", "grew", "growth", "fastest", "rising", "risers", "risen", "up the most", "increase", "increasing", "increased", "gaining", "booming", "gainers"],
  declining: ["declining", "decline", "declines", "declined", "falling", "fell", "fallers", "dropping", "dropped", "drops", "drop", "shrinking", "decrease", "decreasing", "worst", "losers", "down the most", "biggest falls"],
  largest: ["largest", "biggest", "top", "most", "leading", "main", "major", "key markets", "where do most"],
  tenYear: ["10 year trend", "ten year trend", "long term growth", "best long term", "strongest long term", "10 year growth"],
  listNouns: ["markets", "countries", "nations", "nationalities", "markets list"],
  applicants: ["applicant", "applicants", "applied", "apply", "applying", "application", "applications", "admit", "admits", "admitted", "admission", "admissions", "enrol", "enroll", "enrolled", "enrolment", "enrollment", "enrollments", "enrolments", "deposit", "deposits", "slate", "yield", "inquiries", "inquiry", "leads"],
  writing: ["email", "emails", "e mail", "write", "draft", "reply", "respond", "letter", "message", "compose", "template"],
  legal: ["legal", "lawyer", "attorney", "eligible", "eligibility", "can i get a visa", "will i get", "visa interview tips", "waiver", "exemption"],
  otherScope: ["weather", "news", "stock", "salary", "tuition", "scholarship", "scholarships", "deadline", "ielts", "toefl", "gre", "sat", "ranking of universities", "joke", "recipe"],
  forecast: ["forecast", "forecasts", "predict", "prediction", "predictions", "projection", "projections", "next year", "going to be", "will be", "will there", "will it", "will the", "will we", "will they", "expected to", "in the future", "future"],
  weUs: ["we", "our", "ours", "quinnipiac", "qu"],
  visaF1: ["f1", "f 1", "student", "students", "student visa", "student visas"],
  visaJ1: ["j1", "j 1", "exchange", "exchange visitor", "exchange visitors", "exchange visa", "exchange visas"],
  visaBoth: ["both", "f1 and j1", "f1 j1", "f1 or j1", "all visas", "f1 plus j1", "combined"],
  followUp: ["and", "what about", "how about", "and for", "same for", "now for", "also for", "and what about"],
} as const;

/** Whether the padded, normalized text contains a phrase as whole words. */
const has = (padded: string, phrases: readonly string[]): boolean => phrases.some((p) => padded.includes(` ${p} `));
const startsWithAny = (padded: string, phrases: readonly string[]): boolean => phrases.some((p) => padded.startsWith(` ${p} `));

/** The words of a phrase list that appear, longest first. */
function definitionIn(padded: string): Definition | null {
  let best: { d: Definition; len: number } | null = null;
  for (const d of DEFINITIONS) {
    for (const a of [d.term, ...d.aliases].map(normalize)) {
      if (a && padded.includes(` ${a} `) && (!best || a.length > best.len)) best = { d, len: a.length };
    }
  }
  return best?.d ?? null;
}

function navTopicIn(padded: string): NavTopic | null {
  let best: { t: NavTopic; len: number } | null = null;
  for (const t of NAV_TOPICS) {
    for (const k of t.keywords.map(normalize)) {
      if (k && padded.includes(` ${k} `) && (!best || k.length > best.len)) best = { t, len: k.length };
    }
  }
  return best?.t ?? null;
}

/**
 * "US"/"U.S." in the original text as a nationality ("US students", "the U.S.")
 * — not as the visa issuer ("U.S. visas", "U.S. travel ban", "U.S. consulates").
 */
function namesUS(raw: string): boolean {
  const re = /\b(?:U\.S\.A?\.?|USA|US)(?=[\s?.!,]|$)(\s+\w+)?/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const next = (m[1] ?? "").trim().toLowerCase();
    if (!/^(visa|visas|consulate|consulates|embassy|embassies|government|state|travel|department|issued|issuances|immigration|ban|bans|entry)$/.test(next)) return true;
  }
  return false;
}

/**
 * Reads a question. `countries` are the dashboard's country names; `dataEnd` is
 * the data's last month (year * 12 + month - 1): a later year is a forecast.
 */
export function matchQuestion(text: string, countries: readonly string[], dataEnd = Number.MAX_SAFE_INTEGER): Question {
  const n = normalize(text);
  const padded = ` ${n} `;
  const places = findPlaces(text, countries);
  const found = places.filter((p) => p.kind === "country").map((p) => (p as { country: string }).country);
  const special = places.find((p) => p.kind === "special");
  const ambiguous = places.find((p) => p.kind === "ambiguous");
  const region = places.find((p) => p.kind === "region");
  const mentionsUS = places.some((p) => p.kind === "united-states") || namesUS(text);
  // "us" as in "are we", not "tell us about India".
  const lowerUs = /\b(we|our|ours)\b/i.test(text) || (/\bus\b/.test(text) && !/\b(?:tell|show|give|let|help|send|for) us\b/i.test(text));

  const f1 = has(padded, INTENT_WORDS.visaF1);
  const j1 = has(padded, INTENT_WORDS.visaJ1);
  const visa: VisaSelection | null = has(padded, INTENT_WORDS.visaBoth) || (f1 && j1) ? "Both" : f1 ? "F1" : j1 ? "J1" : null;

  const fy = /\bfy\s?((?:19|20)\d{2})\b/.exec(n);
  const cal = /\b((?:19|20)\d{2})\b/.exec(n.replace(/\bfy\s?(?:19|20)\d{2}\b/g, ""));
  const year = fy ? { year: Number(fy[1]), fiscal: true } : cal ? { year: Number(cal[1]), fiscal: false } : null;

  const top = /\btop (\d{1,2})\b/.exec(n) ?? /\b(\d{1,2}) (?:largest|biggest|fastest|top|best|worst|markets|countries)\b/.exec(n);
  const limit = top ? Number(top[1]) : null;

  const catMatch =
    /\b(core|emerging|growth|recovery|watch|declining|restricted) (?:markets?|countries|category)\b/.exec(n) ??
    /\bcategory (core|emerging|growth|recovery|watch|declining|restricted)\b/.exec(n) ??
    /\bmarkets? (?:are|in) (core|emerging|recovery|watch)\b/.exec(n);
  let category = catMatch ? (MARKET_CATEGORIES.find((c) => c.toLowerCase() === catMatch[1]) ?? null) : null;
  // "declining markets" and "growth markets" read as lists by change unless "category" is said.
  if ((category === "Declining" || category === "Growth") && !/\bcategory\b/.test(n)) category = null;

  const sort: ListSort | null = has(padded, INTENT_WORDS.tenYear)
    ? "10-year"
    : has(padded, INTENT_WORDS.declining)
      ? "declining"
      : has(padded, INTENT_WORDS.growing)
        ? "growing"
        : has(padded, INTENT_WORDS.largest)
          ? "nationals"
          : null;

  const definition = definitionIn(padded);
  const navTopic = navTopicIn(padded);
  const weUs = lowerUs || has(padded, ["quinnipiac", "qu"]);
  const words = n.split(" ").filter(Boolean);
  const followUp = startsWithAny(padded, INTENT_WORDS.followUp) && words.length <= 6;

  const outOfScope: OutOfScope | null = has(padded, INTENT_WORDS.applicants)
    ? "applicants"
    : has(padded, INTENT_WORDS.writing)
      ? "writing"
      : has(padded, INTENT_WORDS.legal)
        ? "legal"
        : has(padded, INTENT_WORDS.otherScope)
          ? "other"
          : null;

  const q: Question = {
    text,
    intent: "unknown",
    countries: found,
    special: special ? (special as { name: string }).name : null,
    ambiguous: ambiguous ? { word: (ambiguous as { word: string }).word, options: (ambiguous as { options: readonly string[] }).options } : null,
    region: region ? (region as { region: string }).region : null,
    visa,
    year,
    sort,
    category,
    limit,
    definition,
    navTopic,
    mentionsUS,
    weUs,
    followUp,
    outOfScope,
  };

  const set = (intent: Intent): Question => ({ ...q, intent });
  const hasCountry = found.length > 0;
  const strongDef = has(padded, INTENT_WORDS.strongDefinition);
  const navPhrase = has(padded, INTENT_WORDS.nav);

  if (!n) return set("tour");
  if (outOfScope) return set("out_of_scope");
  const lastYear = Math.floor(dataEnd / 12);
  const lastFiscalYear = dataEnd % 12 >= 9 ? lastYear + 1 : lastYear;
  const futureYear = year !== null && year.year > (year.fiscal ? lastFiscalYear : lastYear);
  if (has(padded, INTENT_WORDS.forecast) || /\b(?:what|how|when|which) will\b/.test(n) || futureYear) return set("forecast");
  if (has(padded, INTENT_WORDS.greeting) && words.length <= 3 && !hasCountry) return set("greeting");
  if (has(padded, INTENT_WORDS.thanks) && words.length <= 4 && !hasCountry) return set("thanks");
  if (has(padded, INTENT_WORDS.tour) && !hasCountry && !navTopic) return set("tour");
  if (q.special) return set("special");
  if (q.ambiguous && !hasCountry) return set("ambiguous");
  if (definition && has(padded, INTENT_WORDS.definitionTriggers) && (!hasCountry || strongDef) && !(navPhrase && navTopic)) return set("definition");
  if (navTopic && (navPhrase || strongDef || (navTopic.id === "show-events" && has(padded, ["show events", "hide events", "turn on events", "turn off events"])))) return set("navigation");
  if (has(padded, INTENT_WORDS.coverage) || (/\b(data|dashboard)\b/.test(n) && /\b(recent|current|latest|updated|new)\b/.test(n))) return set("coverage");
  if (has(padded, INTENT_WORDS.restrictions) || category === "Restricted") return set("restrictions");
  if (has(padded, INTENT_WORDS.events)) return set("events");
  if (has(padded, INTENT_WORDS.consulates) || /\bwhere (?:do|did|does|are|is)\b.*\b(?:get|got|getting|issued|receive)\b/.test(n)) return set("consulates");
  if (hasCountry && (has(padded, INTENT_WORDS.vsWorld) || (found.length === 1 && has(padded, INTENT_WORDS.compare)))) return set("vs_world");
  if (hasCountry && has(padded, INTENT_WORDS.history)) return set("history");
  if (has(padded, INTENT_WORDS.cycles) || (!hasCountry && has(padded, INTENT_WORDS.vsWorld))) return set("cycles");
  if (!hasCountry && (sort || category || limit || (region && has(padded, INTENT_WORDS.listNouns)) || (has(padded, INTENT_WORDS.listNouns) && has(padded, ["which", "list", "show"])))) return set("list");
  if (hasCountry && found.length > 1) return set("overview");
  if (hasCountry && (has(padded, INTENT_WORDS.timing) || /\b(?:core|emerging|growth|recovery|watch|declining|restricted) market\b/.test(n))) return set("overview");
  if (hasCountry && has(padded, INTENT_WORDS.trend)) return set("trend");
  if (hasCountry && has(padded, INTENT_WORDS.overview)) return set("overview");
  if (hasCountry) return set("summary");
  if (year) return set("events");
  if (region) return set("list");
  if (mentionsUS) return set("united_states");
  if (!hasCountry && has(padded, INTENT_WORDS.history)) return set("definition");
  if (navPhrase || has(padded, INTENT_WORDS.tour)) return set("tour");
  if (weUs && (has(padded, INTENT_WORDS.trend) || has(padded, INTENT_WORDS.overview))) return set("cycles");
  if (definition && has(padded, INTENT_WORDS.definitionTriggers)) return set("definition");
  return set("unknown");
}

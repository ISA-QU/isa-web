/**
 * Turns a question into answer cards: match.ts reads it, this picks the tools,
 * and the cards are the tools' results unchanged (same numbers and wording as
 * the tabs). Anything the dashboard can't answer gets "I don't know" and four
 * suggested questions. The last question is remembered only for follow-ups
 * ("And China?") and lives in the panel's memory, never stored.
 */

import { monthDisplay } from "../format";
import type { VisaSelection } from "../types";
import { controlCountries } from "../markets";
import { matchQuestion, type Intent, type ListSort, type Question } from "./match";
import { suggestedQuestions, type Suggestion } from "./suggestions";
import { runTool } from "./tools";
import type { ToolContext, ToolResult } from "./types";

export type AnswerKind = "answer" | "dont-know" | "clarify" | "greeting";

export interface Answer {
  kind: AnswerKind;
  question: Question;
  /** A short line above the cards (greetings, "I don't know", "Which Congo?"). */
  intro: string | null;
  cards: ToolResult[];
  /** Lines under the cards, e.g. the "we/our" note. */
  notes: string[];
  suggestions: Suggestion[];
}

/** What a follow-up ("And China?", "What about J1?") reuses. */
export interface Memory {
  intent: Intent;
  countries: string[];
  visa: VisaSelection | null;
  sort: ListSort | null;
  region: string | null;
  category: string | null;
  year: Question["year"];
  limit: number | null;
}

export const DONT_KNOW = "I don't know — the dashboard doesn't have that.";

export const WE_NOTE =
  "This dashboard shows U.S. visa issuances worldwide (State Department data), not Quinnipiac's own applicants or enrolments.";

const SCOPE_NOTES = {
  applicants: "It shows U.S. visa issuances by nationality, not Quinnipiac's applicants, admissions or enrolments.",
  writing: "I don't write emails or replies; I only answer from the dashboard's data.",
  legal: "I can't give visa or legal advice; the travel-ban answers cite the State Department sources.",
  other: "I only answer questions about this dashboard's visa data.",
} as const;

/** Intents that answer with data (so the "we/our" note applies). */
const DATA_INTENTS: readonly Intent[] = ["summary", "overview", "trend", "list", "cycles", "vs_world", "history", "consulates", "events", "restrictions"];

const MAX_COUNTRIES = 3;

function cardsFor(q: Question, ctx: ToolContext): ToolResult[] {
  const visa = q.visa ?? undefined;
  const countries = q.countries.slice(0, MAX_COUNTRIES);
  const each = (tool: string, extra: Record<string, string | number | undefined> = {}) =>
    countries.map((country) => runTool(tool, ctx, { country, visa, ...extra }));
  switch (q.intent) {
    case "summary":
      return countries.flatMap((country) => [
        runTool("country_overview", ctx, { country, visa }),
        runTool("country_trend", ctx, { country, visa }),
        runTool("history_label", ctx, { country }),
        runTool("country_vs_world", ctx, { country, visa }),
      ]);
    case "overview":
      return each("country_overview");
    case "trend":
      return each("country_trend");
    case "history":
      return countries.map((country) => runTool("history_label", ctx, { country }));
    case "vs_world":
      return each("country_vs_world");
    case "consulates":
      return countries.length > 0 ? each("consulates") : [runTool("navigation", ctx, { topic: "consulates" })];
    case "restrictions":
      return countries.length > 0 ? countries.map((country) => runTool("restrictions", ctx, { country })) : [runTool("restrictions", ctx)];
    case "events": {
      const year = q.year ? `${q.year.fiscal ? "FY" : ""}${q.year.year}` : undefined;
      return countries.length > 0 ? countries.map((country) => runTool("events", ctx, { country, year })) : [runTool("events", ctx, { year })];
    }
    case "cycles":
      return countries.length > 0 ? each("market_cycles") : [runTool("market_cycles", ctx, { visa })];
    case "list":
      return [
        runTool("list_markets", ctx, {
          sort: q.sort ?? "nationals",
          visa,
          region: q.region ?? undefined,
          category: q.category ?? undefined,
          limit: q.limit ?? undefined,
        }),
      ];
    case "definition":
      return [runTool("definition", ctx, { term: q.definition?.term ?? "history labels" })];
    case "coverage":
      return [runTool("data_coverage", ctx)];
    case "navigation": {
      const card = runTool("navigation", ctx, { topic: q.navTopic?.id });
      // Open the tab on the country asked about, if any.
      return countries[0] && card.link ? [{ ...card, link: { ...card.link, country: countries[0] } }] : [card];
    }
    case "tour":
      return [runTool("navigation", ctx, { topic: "tour" })];
    case "special":
      return [runTool("special_category", ctx, { name: q.special ?? "", visa })];
    case "united_states":
      return [runTool("country_overview", ctx, { country: "United States" })];
    default:
      return [];
  }
}

/** A follow-up takes the previous question and swaps in what the new one names. */
function mergeFollowUp(q: Question, memory: Memory | null): Question {
  if (!memory || !q.followUp) return q;
  const ownIntent = !["summary", "unknown", "list", "events"].includes(q.intent);
  if (ownIntent) return q;
  const countries = q.countries.length > 0 ? q.countries : memory.countries;
  return {
    ...q,
    intent: memory.intent === "summary" && q.countries.length === 0 && countries.length === 0 ? "unknown" : memory.intent,
    countries,
    visa: q.visa ?? memory.visa,
    sort: q.sort ?? memory.sort,
    region: q.region ?? (q.countries.length > 0 ? null : memory.region),
    category: q.category ?? memory.category,
    year: q.year ?? memory.year,
    limit: q.limit ?? memory.limit,
  };
}

const NEEDS_COUNTRY: readonly Intent[] = ["summary", "overview", "trend", "history", "vs_world"];

export interface AnswerContext extends ToolContext {
  /** The dashboard's selected country, for the suggested questions. */
  focusCountry?: string;
}

/** Answers one question. Returns the answer and what a follow-up can reuse. */
export function answerQuestion(text: string, ctx: AnswerContext, memory: Memory | null = null): { answer: Answer; memory: Memory | null } {
  const countries = controlCountries(ctx.data);
  const q = mergeFollowUp(matchQuestion(text, countries, ctx.data.meta.coverage.postsMonthly.end), memory);
  const suggestions = suggestedQuestions(ctx.focusCountry ?? q.countries[0] ?? null);
  const base = { question: q, notes: [] as string[], suggestions };

  // After "I don't know", a clarification or a not-in-data reply, a follow-up starts afresh
  // ("And Japan?" after "USA" gives Japan's summary), so those replies clear the memory.
  const dontKnow = (note?: string): { answer: Answer; memory: Memory | null } => ({
    answer: { ...base, kind: "dont-know", intro: DONT_KNOW, cards: [], notes: note ? [note] : [] },
    memory: null,
  });

  switch (q.intent) {
    case "greeting":
      return { answer: { ...base, kind: "greeting", intro: "Hello! Ask me about a country, the markets, travel bans, events or how to use a tab.", cards: [] }, memory };
    case "thanks":
      return { answer: { ...base, kind: "greeting", intro: "You're welcome. Anything else?", cards: [] }, memory };
    case "out_of_scope":
      return dontKnow(SCOPE_NOTES[q.outOfScope ?? "other"]);
    case "forecast":
      return dontKnow(`The dashboard doesn't forecast: it shows visas issued up to ${monthDisplay(ctx.data.meta.coverage.postsMonthly.end)}.`);
    case "unknown":
      return dontKnow();
    case "ambiguous": {
      const word = q.ambiguous?.word ?? "";
      const options = q.ambiguous?.options ?? [];
      const re = new RegExp(`\\b${word}\\b`, "i");
      return {
        answer: {
          ...base,
          kind: "clarify",
          intro: `Which one do you mean: ${options.join(" or ")}?`,
          cards: [],
          suggestions: options.map((o) => ({ text: re.test(text) ? text.replace(re, o) : `How is ${o} doing?`, country: o })),
        },
        memory: null,
      };
    }
    default:
      break;
  }

  if (NEEDS_COUNTRY.includes(q.intent) && q.countries.length === 0) return dontKnow();
  const cards = cardsFor(q, ctx);
  if (cards.length === 0) return dontKnow();
  const notes: string[] = [];
  if (q.weUs && DATA_INTENTS.includes(q.intent)) notes.push(WE_NOTE);
  if (q.mentionsUS && q.intent !== "united_states" && q.countries.length > 0) {
    cards.unshift(runTool("country_overview", ctx, { country: "United States" }));
  }
  if (q.countries.length > MAX_COUNTRIES) notes.push(`I've answered for the first ${MAX_COUNTRIES} countries.`);
  // Only a data answer is remembered for follow-ups: not the U.S. note, a special category,
  // navigation, a definition, or an answer whose cards all say the data isn't there.
  const remember = DATA_INTENTS.includes(q.intent) && cards.some((c) => c.status === "ok");
  return {
    answer: { ...base, kind: "answer", intro: null, cards, notes },
    memory: !remember ? null : {
      intent: q.intent,
      countries: q.countries,
      visa: q.visa,
      sort: q.sort,
      region: q.region,
      category: q.category,
      year: q.year,
      limit: q.limit,
    },
  };
}

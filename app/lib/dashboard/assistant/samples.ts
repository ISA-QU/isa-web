/**
 * Sample questions and what they must lead to, checked by the verify script
 * (one check each). Add a line here whenever you add an alias, a keyword or an
 * intent. `after` is the question asked just before (for follow-ups).
 *
 * Expected form: "intent | tool:Country, tool | key=value …", from describeAnswer().
 */

import type { Answer } from "./answer";

export interface Sample {
  q: string;
  expect: string;
  after?: string;
}

/** One line per answer: intent, the cards (tool and country) and the parsed details. */
export function describeAnswer(a: Answer): string {
  const q = a.question;
  const cards = a.cards.map((c) => `${c.tool}${c.country ? `:${c.country}` : ""}${c.status === "ok" ? "" : `(${c.status})`}`).join(", ");
  const extras = [
    q.year ? `year=${q.year.fiscal ? "FY" : ""}${q.year.year}` : null,
    q.sort && q.intent === "list" ? `sort=${q.sort}` : null,
    q.region && q.intent === "list" ? `region=${q.region}` : null,
    q.category && q.intent === "list" ? `category=${q.category}` : null,
    q.visa ? `visa=${q.visa}` : null,
    q.navTopic && q.intent === "navigation" ? `topic=${q.navTopic.id}` : null,
    a.notes.some((n) => n.includes("not Quinnipiac's own")) ? "note=we" : null,
    a.kind === "dont-know" ? "dont-know" : null,
    a.kind === "clarify" ? "clarify" : null,
  ].filter(Boolean);
  return [q.intent, cards || "—", extras.join(" ") || "—"].join(" | ");
}

const SUMMARY = (c: string) => `country_overview:${c}, country_trend:${c}, history_label:${c}, country_vs_world:${c}`;

export const SAMPLES: readonly Sample[] = [
  // A country on its own: the combined summary.
  { q: "India", expect: `summary | ${SUMMARY("India")} | —` },
  { q: "Tell me about Nepal", expect: `summary | ${SUMMARY("Nepal")} | —` },
  { q: "Korea", expect: `summary | ${SUMMARY("South Korea")} | —` },
  { q: "UAE", expect: `summary | ${SUMMARY("United Arab Emirates")} | —` },
  { q: "Viet Nam", expect: `summary | ${SUMMARY("Vietnam")} | —` },
  { q: "Côte d'Ivoire", expect: `summary | ${SUMMARY("Cote d'Ivoire")} | —` },
  { q: "Niger", expect: `summary | ${SUMMARY("Niger")} | —` },
  { q: "Nigeria", expect: `summary | ${SUMMARY("Nigeria")} | —` },
  { q: "Papua New Guinea", expect: `summary | ${SUMMARY("Papua New Guinea")} | —` },
  { q: "J1 in Germany", expect: `summary | ${SUMMARY("Germany")} | visa=J1` },
  { q: "Tell us about India", expect: `summary | ${SUMMARY("India")} | —` },
  // How a country is doing.
  { q: "How is India doing?", expect: "overview | country_overview:India | —" },
  { q: "How's Vietnam doing?", expect: "overview | country_overview:Vietnam | —" },
  { q: "Turkish students last 12 months", expect: "overview | country_overview:Turkey | visa=F1" },
  { q: "When is India's peak month?", expect: "overview | country_overview:India | —" },
  { q: "Is India a core market?", expect: "overview | country_overview:India | —" },
  { q: "Compare India and China", expect: "overview | country_overview:India, country_overview:China | —" },
  { q: "How is Hong Kong doing?", expect: "overview | country_overview:Hong Kong | —" },
  // Long-term trend.
  { q: "India's 10-year trend", expect: "trend | country_trend:India | —" },
  { q: "Is Ghana growing?", expect: "trend | country_trend:Ghana | —" },
  { q: "Show me J1 trends for Japan", expect: "trend | country_trend:Japan | visa=J1" },
  { q: "Saudi students since 2019", expect: "trend | country_trend:Saudi Arabia | year=2019 visa=F1" },
  // Lists of markets.
  { q: "Fastest-growing markets", expect: "list | list_markets | sort=growing" },
  { q: "Top growing in Africa", expect: "list | list_markets | sort=growing region=Africa" },
  { q: "Biggest declines", expect: "list | list_markets | sort=declining" },
  { q: "Top 10 J1 countries", expect: "list | list_markets | sort=nationals visa=J1" },
  { q: "Which countries have the most F1 students?", expect: "list | list_markets | sort=nationals visa=F1" },
  { q: "Which markets are Emerging?", expect: "list | list_markets | category=Emerging" },
  { q: "Core markets", expect: "list | list_markets | category=Core" },
  { q: "European markets", expect: "list | list_markets | region=Europe" },
  { q: "Central Asian markets", expect: "list | list_markets | region=Central Asia" },
  { q: "Largest markets in the Middle East", expect: "list | list_markets | sort=nationals region=Middle East" },
  { q: "Top 5 in Latin America", expect: "list | list_markets | sort=nationals region=Latin America" },
  { q: "Best 10-year trend", expect: "list | list_markets | sort=10-year" },
  // Restrictions.
  { q: "Which countries have a travel ban?", expect: "restrictions | restrictions | —" },
  { q: "Which countries have a U.S. travel ban?", expect: "restrictions | restrictions | —" },
  { q: "Is Nigeria restricted?", expect: "restrictions | restrictions:Nigeria | —" },
  { q: "Which countries are paused?", expect: "restrictions | restrictions | —" },
  // History, world, cycles.
  { q: "Is China's decline structural?", expect: "history | history_label:China | —" },
  { q: "Has Brazil recovered before?", expect: "history | history_label:Brazil | —" },
  { q: "UK history", expect: "history | history_label:United Kingdom | —" },
  { q: "How does Nepal compare with the world?", expect: "vs_world | country_vs_world:Nepal | —" },
  { q: "Kenya vs world", expect: "vs_world | country_vs_world:Kenya | —" },
  { q: "World downturns", expect: "cycles | market_cycles | —" },
  { q: "Are Chinese numbers recovering?", expect: "cycles | market_cycles:China | —" },
  { q: "Are we in a downturn?", expect: "cycles | market_cycles | note=we" },
  { q: "How are we doing?", expect: "cycles | market_cycles | note=we" },
  // Consulates.
  { q: "Where do Indians get visas?", expect: "consulates | consulates:India | —" },
  { q: "Busiest consulates in India", expect: "consulates | consulates:India | —" },
  { q: "Mexico consulates J1", expect: "consulates | consulates:Mexico | visa=J1" },
  // Events: years reach the events tool as a year, never a country.
  { q: "What happened in 2020?", expect: "events | events | year=2020" },
  { q: "FY2019", expect: "events | events | year=FY2019" },
  { q: "Events in FY2020 for China", expect: "events | events:China | year=FY2020" },
  { q: "Events affecting Iran", expect: "events | events:Iran | —" },
  { q: "Why did India drop?", expect: "events | events:India | —" },
  // Definitions and coverage.
  { q: "What does Structural mean?", expect: "definition | definition | —" },
  { q: "What's provisional?", expect: "definition | definition | —" },
  { q: "What is a travel ban?", expect: "definition | definition | —" },
  { q: "How recent is the data?", expect: "coverage | data_coverage | —" },
  { q: "Is FY2025 final?", expect: "coverage | data_coverage | year=FY2025" },
  // Special rows, the United States, ambiguous names.
  { q: "BNO passports", expect: "special | special_category | —" },
  { q: "Palestinian students", expect: "special | special_category | visa=F1" },
  { q: "US students", expect: "united_states | country_overview(not-in-data) | visa=F1" },
  { q: "American students", expect: "united_states | country_overview(not-in-data) | visa=F1" },
  { q: "Congo", expect: "ambiguous | — | clarify" },
  // Follow-ups.
  { q: "And China?", after: "How is India doing?", expect: "overview | country_overview:China | —" },
  { q: "What about J1?", after: "How is India doing?", expect: "overview | country_overview:India | visa=J1" },
  { q: "And Japan?", after: "How is Nepal doing?", expect: "overview | country_overview:Japan | —" },
  { q: "And Japan?", after: "USA", expect: `summary | ${SUMMARY("Japan")} | —` },
  { q: "What about Brazil?", after: "US students", expect: `summary | ${SUMMARY("Brazil")} | —` },
  { q: "And Ghana?", after: "Congo", expect: `summary | ${SUMMARY("Ghana")} | —` },
  { q: "And Japan?", after: "How many Indian students applied to QU?", expect: `summary | ${SUMMARY("Japan")} | —` },
  { q: "And Kenya?", after: "BNO passports", expect: `summary | ${SUMMARY("Kenya")} | —` },
  { q: "And China?", after: "Is Nigeria restricted?", expect: "restrictions | restrictions:China | —" },
  { q: "What about 2021?", after: "What happened in 2020?", expect: "events | events | year=2021" },
  // I don't know.
  { q: "How many Indian students applied to QU?", expect: "out_of_scope | — | visa=F1 dont-know" },
  { q: "Write an email to a Nigerian student", expect: "out_of_scope | — | visa=F1 dont-know" },
  { q: "Does the dashboard have Slate data?", expect: "out_of_scope | — | dont-know" },
  { q: "What will FY2027 be?", expect: "forecast | — | year=FY2027 dont-know" },
  { q: "What's the weather?", expect: "out_of_scope | — | dont-know" },
  { q: "asdfgh", expect: "unknown | — | dont-know" },
];

/** Navigation questions: "how do I / where can I", and the tour. */
export const NAV_SAMPLES: readonly Sample[] = [
  { q: "What can you do?", expect: "tour | navigation | —" },
  { q: "Show me around", expect: "tour | navigation | —" },
  { q: "Where can I download a CSV?", expect: "navigation | navigation | topic=csv" },
  { q: "How do I switch to J1?", expect: "navigation | navigation | visa=J1 topic=visa-control" },
  { q: "How do I change the period?", expect: "navigation | navigation | topic=period-control" },
  { q: "What does the purple badge mean?", expect: "navigation | navigation | topic=paused-badge" },
  { q: "Where are the history labels?", expect: "navigation | navigation | topic=history-labels" },
  { q: "Show events on charts", expect: "navigation | navigation | topic=show-events" },
  { q: "Which tab shows consulates?", expect: "navigation | navigation | topic=consulates" },
  { q: "Where is the globe?", expect: "navigation | navigation | topic=executive" },
  { q: "How do I reset the dashboard?", expect: "navigation | navigation | topic=country-control" },
];

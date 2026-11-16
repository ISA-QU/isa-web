/** Suggested questions: the panel's chips, and the four shown with "I don't know". */

export interface Suggestion {
  text: string;
  /** Shown with the country's flag. */
  country?: string;
}

const FALLBACK_COUNTRY = "India";

/** Four questions the dashboard can answer, about the selected country where it fits. */
export function suggestedQuestions(country: string | null): Suggestion[] {
  const c = country ?? FALLBACK_COUNTRY;
  return [
    { text: `How is ${c} doing?`, country: c },
    { text: "Fastest-growing markets" },
    { text: "Which countries have a travel ban?" },
    { text: `How does ${c} compare with the world?`, country: c },
  ];
}

/** The welcome chips: the four above plus two more. */
export function welcomeSuggestions(country: string | null): Suggestion[] {
  return [
    ...suggestedQuestions(country),
    { text: "What happened in 2020?" },
    { text: "What can you do?" },
  ];
}

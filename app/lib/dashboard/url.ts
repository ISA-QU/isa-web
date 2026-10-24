/**
 * Tab names in the web address. Pages that were merged keep working in old
 * links: Consulate Intelligence and Historical Consulates became Consulates (8-1);
 * Country Intelligence became part of Country 360 (8-2a); Command Center became
 * Markets (8-3).
 */
export const TAB_ALIASES: Readonly<Record<string, string>> = {
  // The Command Center became Markets (8-3).
  command: "markets",
  "consulate-intelligence": "consulates",
  "historical-consulates": "consulates",
  "country-intelligence": "country-360",
};

/** The tab to open for a `tab=` value, or undefined when it names no tab. */
export function canonicalTab(raw: string | null | undefined, tabIds: readonly string[]): string | undefined {
  if (!raw) return undefined;
  const tab = TAB_ALIASES[raw] ?? raw;
  return tabIds.includes(tab) ? tab : undefined;
}

/** The option matching a `country=` value, ignoring capitalisation (country=china opens China). */
export function matchOption(raw: string | null | undefined, options: readonly string[]): string | undefined {
  if (!raw) return undefined;
  if (options.includes(raw)) return raw;
  const wanted = raw.trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === wanted);
}

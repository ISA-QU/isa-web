/**
 * Tab names in the web address. Pages that were merged keep working in old
 * links: Consulate Intelligence and Historical Consulates became Consulates (8-1).
 */
export const TAB_ALIASES: Readonly<Record<string, string>> = {
  "consulate-intelligence": "consulates",
  "historical-consulates": "consulates",
};

/** The tab to open for a `tab=` value, or undefined when it names no tab. */
export function canonicalTab(raw: string | null | undefined, tabIds: readonly string[]): string | undefined {
  if (!raw) return undefined;
  const tab = TAB_ALIASES[raw] ?? raw;
  return tabIds.includes(tab) ? tab : undefined;
}

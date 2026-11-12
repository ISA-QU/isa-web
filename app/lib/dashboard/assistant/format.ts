/** A tool result as plain text: for the terminal runner, and later the panel's Copy button. */

import { TAB_LABELS, linkSearch, sourceText, type ToolResult } from "./types";

export function resultText(r: ToolResult, opts: { withLink?: boolean } = {}): string {
  const out: string[] = [r.title, ...r.lines.map((l) => `  ${l}`)];
  for (const note of r.notes ?? []) out.push(`  Note: ${note}`);
  for (const s of r.sources) out.push(`  Source: ${sourceText(s)}`);
  for (const l of r.links ?? []) out.push(`  Link: ${l.label} — ${l.url}`);
  if (opts.withLink && r.link) out.push(`  Open tab: ${TAB_LABELS[r.link.tab]} (${linkSearch(r.link)})`);
  return out.join("\n");
}

/**
 * The Bobcat assistant's shared shapes. Tools (tools.ts) return a ToolResult;
 * the question matcher and the panel (Step 2) only read these, so new tools —
 * or, later, a model that calls the same tools — plug in without changes
 * elsewhere.
 */

import type { DashboardData, VisaSelection } from "../types";

/** The dashboard's tab ids (DashboardShell's TABS). */
export type TabId = "markets" | "executive" | "country-360" | "consulates" | "historical-trends";

export const TAB_LABELS: Record<TabId, string> = {
  markets: "Markets",
  executive: "Executive",
  "country-360": "Country 360",
  consulates: "Consulates",
  "historical-trends": "Historical Trends",
};

/** Where an answer's numbers can be checked: tab · measure · period. */
export interface SourceLine {
  tab: string;
  measure: string;
  period: string;
}

/** "Open tab": the tab plus the country, visa and period that show the same numbers. */
export interface TabLink {
  tab: TabId;
  country?: string;
  visa?: VisaSelection;
  /** Always the last 12 months when set, so the tab shows the tool's numbers. */
  period?: "last12";
  /** The tab's own address settings, e.g. Consulates' scope=country. */
  params?: Record<string, string>;
}

/** An outside page an answer cites (State Department notices, event sources). */
export interface ExternalLink {
  label: string;
  url: string;
}

export type ToolStatus =
  /** An answer from the data. */
  | "ok"
  /** The country isn't in the data under that name; `suggestions` has close matches. */
  | "unknown-country"
  /** The term or value isn't one the dashboard has; `suggestions` lists valid ones. */
  | "unknown"
  /** A known gap: the United States isn't in visa data, a table is missing from the snapshot. */
  | "not-in-data"
  /** The tool failed; it says so instead of guessing. */
  | "error";

export interface ToolResult {
  tool: string;
  status: ToolStatus;
  title: string;
  /** Ready-to-show lines, numbers formatted exactly as on the tabs. */
  lines: string[];
  /** The first is the main one. Every result has at least one. */
  sources: SourceLine[];
  link: TabLink | null;
  /** The country the answer is about (for the flag), if any. */
  country?: string;
  /** "Did you mean…" names, or the valid values for an unknown term. */
  suggestions?: string[];
  /** Notes shown under the answer (small print, the F1 history note, fallbacks). */
  notes?: string[];
  links?: ExternalLink[];
}

/** What every tool gets: the loaded snapshot and the dashboard's Visa control. */
export interface ToolContext {
  data: DashboardData;
  visa: VisaSelection;
}

export interface ParamSpec {
  type: "string" | "number";
  description: string;
  /** Allowed values, when the parameter is a choice. */
  options?: readonly string[];
  optional?: boolean;
}

/** A tool: a name, a description and parameters (so a later model could call it too), and a pure run(). */
export interface ToolDef {
  name: string;
  description: string;
  params: Record<string, ParamSpec>;
  run: (ctx: ToolContext, args: Record<string, string | number | undefined>) => ToolResult;
}

/** "Country 360 · nationals · last 12 months (Mar 2025 – Feb 2026)". */
export const sourceText = (s: SourceLine): string => `${s.tab} · ${s.measure} · ${s.period}`;

const VISA_PARAM: Record<VisaSelection, string> = { F1: "f1", J1: "j1", Both: "both" };

/** The dashboard address for a link, e.g. "?tab=country-360&country=India&visa=f1&period=last12". */
export function linkSearch(link: TabLink): string {
  const params = new URLSearchParams();
  params.set("tab", link.tab);
  if (link.country) params.set("country", link.country);
  if (link.visa) params.set("visa", VISA_PARAM[link.visa]);
  if (link.period) params.set("period", link.period);
  for (const [key, value] of Object.entries(link.params ?? {})) params.set(key, value);
  return `?${params.toString()}`;
}

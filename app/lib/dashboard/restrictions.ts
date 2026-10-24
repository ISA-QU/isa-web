/**
 * U.S. visa restrictions by nationality, entered by hand from State Department
 * notices (8-3). Information only, not legal advice: check the sources before
 * acting, and update `LAST_CHECKED` whenever this list is reviewed.
 *
 * Proclamation 10998 (effective 1 Jan 2026) continued the earlier Proclamation
 * 10949 (effective 9 Jun 2025), so each country stores the date its student and
 * exchange (F, M, J) visas have been suspended since.
 *
 * A country can have more than one restriction (South Sudan has both).
 * Names use the dashboard's country names (e.g. Burma → Myanmar).
 */

export const LAST_CHECKED = "2026-10-23";

export type RestrictionType = "travel-ban" | "visa-pause";
export type RestrictionLevel = "full" | "partial" | "immigrant-only" | "temporary";

export interface RestrictionSource {
  title: string;
  url: string;
  /** The page's own "last updated" date, when known. */
  updated?: string;
}

export interface Restriction {
  country: string;
  type: RestrictionType;
  /** The level in force today. */
  level: RestrictionLevel;
  /** ISO date today's level took effect. */
  effective: string;
  /** ISO date student and exchange visas have been suspended since; null when they are not suspended. */
  suspendedSince: string | null;
  /** Whether F, M and J visas are blocked today. */
  studentVisasAffected: boolean;
  /** Student and exchange visas suspended earlier and since restored (Turkmenistan). */
  restored?: { suspendedFrom: string; suspendedTo: string; restoredOn: string };
  /** One line on how the restriction got here, for the tooltip. */
  history: string;
  /** For a pause: why, e.g. "Ebola". */
  reason?: string;
  sources: RestrictionSource[];
  lastChecked: string;
}

const PROCLAMATION_10949: RestrictionSource = {
  title:
    'U.S. Department of State, "Suspension of Visa Issuance to Foreign Nationals to Protect the United States from Foreign Terrorists and Other National Security and Public Safety Threats" (Presidential Proclamation 10949)',
  url: "https://travel.state.gov/content/travel/en/News/visas-news/suspension-of-visa-issuance-to-foreign-nationals-to-protect-the-united-states-from-foreign-terrorists-and-other-national-security-and-public-safety-threats.html",
};

const PROCLAMATION_10998: RestrictionSource = {
  title:
    'U.S. Department of State, "Suspension of Visa Issuance to Foreign Nationals to Protect the Security of the United States" (Presidential Proclamation 10998)',
  url: "https://travel.state.gov/content/travel/en/News/visas-news/suspension-of-visa-issuance-to-foreign-nationals-to-protect-the-security-of-the-united-states.html",
  updated: "2026-02-02",
};

const VISA_PAUSE: RestrictionSource = {
  title: 'U.S. Department of State, "Temporary Pause of Visa Operations"',
  url: "https://travel.state.gov/en/newsroom/visas/2026/temporary-pause-of-visa-operations.html",
  updated: "2026-05-18",
};

const P10949_START = "2025-06-09";
const P10998_START = "2026-01-01";

type BanGroup = {
  level: "full" | "partial";
  since: string;
  history: string;
  sources: RestrictionSource[];
  countries: string[];
};

const BAN_GROUPS: BanGroup[] = [
  {
    level: "full",
    since: P10949_START,
    history: "Full suspension under Proclamation 10949 from 9 Jun 2025, continued by Proclamation 10998 from 1 Jan 2026.",
    sources: [PROCLAMATION_10949, PROCLAMATION_10998],
    countries: [
      "Afghanistan", "Myanmar", "Chad", "Republic of the Congo", "Equatorial Guinea", "Eritrea",
      "Haiti", "Iran", "Libya", "Somalia", "Sudan", "Yemen",
    ],
  },
  {
    level: "full",
    since: P10949_START,
    history: "Partial suspension (including F, M and J) under Proclamation 10949 from 9 Jun 2025; full suspension under Proclamation 10998 from 1 Jan 2026.",
    sources: [PROCLAMATION_10949, PROCLAMATION_10998],
    countries: ["Laos", "Sierra Leone"],
  },
  {
    level: "partial",
    since: P10949_START,
    history: "Partial suspension under Proclamation 10949 from 9 Jun 2025, continued by Proclamation 10998 from 1 Jan 2026.",
    sources: [PROCLAMATION_10949, PROCLAMATION_10998],
    countries: ["Burundi", "Cuba", "Togo", "Venezuela"],
  },
  {
    level: "full",
    since: P10998_START,
    history: "Full suspension under Proclamation 10998 from 1 Jan 2026.",
    sources: [PROCLAMATION_10998],
    countries: ["Burkina Faso", "Mali", "Niger", "South Sudan", "Syria"],
  },
  {
    level: "partial",
    since: P10998_START,
    history: "Partial suspension under Proclamation 10998 from 1 Jan 2026.",
    sources: [PROCLAMATION_10998],
    countries: [
      "Angola", "Antigua and Barbuda", "Benin", "Cote d'Ivoire", "Dominica", "Gabon", "Gambia",
      "Malawi", "Mauritania", "Nigeria", "Senegal", "Tanzania", "Tonga", "Zambia", "Zimbabwe",
    ],
  },
];

const pause = (country: string): Restriction => ({
  country,
  type: "visa-pause",
  level: "temporary",
  effective: "2026-05-18",
  suspendedSince: "2026-05-18",
  studentVisasAffected: true,
  history: "Temporary pause of all U.S. visa services in the country from 18 May 2026; no end date announced.",
  reason: "Ebola",
  sources: [VISA_PAUSE],
  lastChecked: LAST_CHECKED,
});

export const RESTRICTIONS: readonly Restriction[] = [
  ...BAN_GROUPS.flatMap((g) =>
    g.countries.map(
      (country): Restriction => ({
        country,
        type: "travel-ban",
        level: g.level,
        effective: P10998_START,
        suspendedSince: g.since,
        studentVisasAffected: true,
        history: g.history,
        sources: g.sources,
        lastChecked: LAST_CHECKED,
      }),
    ),
  ),
  // Student and exchange visas suspended under 10949, restored under 10998; immigrant visas only since.
  {
    country: "Turkmenistan",
    type: "travel-ban",
    level: "immigrant-only",
    effective: P10998_START,
    suspendedSince: null,
    studentVisasAffected: false,
    restored: { suspendedFrom: P10949_START, suspendedTo: "2025-12-31", restoredOn: P10998_START },
    history:
      "Student and exchange (F, M, J) visas were suspended 9 Jun – 31 Dec 2025 under Proclamation 10949 and restored on 1 Jan 2026; only immigrant visas are restricted since then (Proclamation 10998).",
    sources: [PROCLAMATION_10949, PROCLAMATION_10998],
    lastChecked: LAST_CHECKED,
  },
  // Temporary pause of all visa services, including student and exchange visas.
  pause("Uganda"),
  pause("Democratic Republic of the Congo"),
  pause("South Sudan"),
];

/**
 * Also covered by Proclamation 10998's full suspension (since 1 Jan 2026) but not
 * a country in the dashboard (a special reporting category), so no page or badge.
 */
export const RESTRICTED_NON_COUNTRY = ["Palestinian Authority Travel Document"] as const;

/** Consulates (dashboard post names) where all U.S. visa services are paused. */
export const PAUSED_POSTS: Readonly<Record<string, string>> = {
  Kampala: "Uganda",
  Kinshasa: "Democratic Republic of the Congo",
  Juba: "South Sudan",
};

export const restrictionsFor = (country: string): Restriction[] =>
  RESTRICTIONS.filter((r) => r.country === country);

/**
 * The restriction that blocks student and exchange visas, if any: a travel ban
 * before a temporary pause (South Sudan has both). Null when they are not blocked.
 */
export function studentRestriction(country: string): Restriction | null {
  const affecting = restrictionsFor(country).filter((r) => r.studentVisasAffected);
  return affecting.find((r) => r.type === "travel-ban") ?? affecting[0] ?? null;
}

/** A restriction whose student and exchange visas were suspended and since restored. */
export const restoredRestriction = (country: string): Restriction | null =>
  restrictionsFor(country).find((r) => r.restored) ?? null;

/** "1 Jan 2026". */
export function restrictionDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1]} ${year}`;
}

/** "9 Jun – 31 Dec 2025". */
function restoredSpan(r: Restriction): string {
  if (!r.restored) return "";
  const from = restrictionDate(r.restored.suspendedFrom);
  const to = restrictionDate(r.restored.suspendedTo);
  return from.slice(-4) === to.slice(-4) ? `${from.slice(0, -5)} – ${to}` : `${from} – ${to}`;
}

/** The badge text for one restriction. */
export function restrictionBadgeText(r: Restriction): string {
  if (r.type === "visa-pause") {
    return `Temporary: U.S. visa services paused in ${r.country} since ${restrictionDate(r.effective)}${r.reason ? ` (${r.reason})` : ""}`;
  }
  if (r.restored) {
    return `Student and exchange visas restored ${restrictionDate(r.restored.restoredOn)} (suspended ${restoredSpan(r)}); immigrant visas still restricted`;
  }
  return `Travel ban: student and exchange visas suspended since ${restrictionDate(r.suspendedSince ?? r.effective)}`;
}

/** Short badge label for table cells. */
export function restrictionShortLabel(r: Restriction): string {
  if (r.type === "visa-pause") return "Paused";
  if (r.restored) return "Restored";
  return r.level === "full" ? "Travel ban (full)" : "Travel ban (partial)";
}

/** What "What to do" says for a country whose student and exchange visas are blocked. */
export function restrictedAction(r: Restriction): string {
  return r.type === "visa-pause"
    ? `Restricted (temporary) — U.S. visa services paused in ${r.country} since ${restrictionDate(r.effective)}`
    : `Restricted — student and exchange visas suspended since ${restrictionDate(r.suspendedSince ?? r.effective)}`;
}

/** What "What to do" says for a country whose student and exchange visas were restored. */
export function restoredAction(r: Restriction): string {
  return `Watch — student and exchange visas restored ${restrictionDate(r.restored?.restoredOn ?? r.effective)} after a ${r.restored?.suspendedFrom.slice(0, 4) ?? ""} suspension; the recent fall reflects that suspension`;
}

/** The tooltip: level, history, sources and when it was last checked. */
export function restrictionTooltip(r: Restriction): string {
  const level =
    r.type === "visa-pause"
      ? "Temporary pause of all visa services, including student and exchange visas."
      : r.level === "full"
        ? "Full suspension: all visas, including student and exchange (F, M, J)."
        : r.level === "partial"
          ? "Partial suspension: B-1/B-2 and student and exchange (F, M, J) visas suspended."
          : "Since 1 Jan 2026: immigrant visas only; student and exchange (F, M, J) visas are not affected.";
  const sources = r.sources
    .map((s) => `Source: ${s.title}${s.updated ? `, last updated ${restrictionDate(s.updated)}` : ""}.\n${s.url}`)
    .join("\n");
  return `${level}\n${r.history}\n${sources}\nLast checked ${restrictionDate(r.lastChecked)}.`;
}

/** One line per restriction, for hover text and summary cards (empty when none). */
export const restrictionLines = (country: string): string[] =>
  restrictionsFor(country).map(restrictionBadgeText);

/** CSV columns: "Restriction" and "Suspended since" (ISO dates). */
export function restrictionCsv(country: string): [string, string] {
  const blocking = studentRestriction(country);
  if (blocking) {
    const label =
      blocking.type === "visa-pause"
        ? "Temporary pause"
        : blocking.level === "full"
          ? "Travel ban — full"
          : "Travel ban — partial";
    return [label, blocking.suspendedSince ?? blocking.effective];
  }
  const restored = restoredRestriction(country);
  if (restored?.restored) {
    return ["Restored", `${restored.restored.suspendedFrom} to ${restored.restored.suspendedTo}`];
  }
  return ["none", ""];
}

/**
 * The Consulates note for a country's own scope: what applies to its nationals,
 * and, for a pause, to every nationality at its consulates. Empty when none.
 */
export function consulateScopeNotes(country: string): string[] {
  return restrictionsFor(country).map((r) => {
    if (r.type === "visa-pause") {
      return `All U.S. visa services in ${country} paused since ${restrictionDate(r.effective)}${r.reason ? ` (${r.reason})` : ""}, for every nationality. Pauses may lift without notice.`;
    }
    if (r.restored) {
      return `Nationals of ${country}: student and exchange visas restored ${restrictionDate(r.restored.restoredOn)} after a suspension ${restoredSpan(r)}; only immigrant visas restricted since.`;
    }
    return `Nationals of ${country}: student and exchange visas suspended since ${restrictionDate(r.suspendedSince ?? r.effective)} (travel ban). Consulates in ${country} may still issue visas to other nationalities.`;
  });
}

/** The badge text for a consulate whose visa services are paused. */
export function pausedPostText(post: string): string | null {
  const country = PAUSED_POSTS[post];
  const r = country ? restrictionsFor(country).find((x) => x.type === "visa-pause") : undefined;
  return r
    ? `All U.S. visa services paused since ${restrictionDate(r.effective)}${r.reason ? ` (${r.reason})` : ""}`
    : null;
}

/** The pause behind a paused consulate, for its tooltip. */
export function pausedPostRestriction(post: string): Restriction | null {
  const country = PAUSED_POSTS[post];
  return (country && restrictionsFor(country).find((x) => x.type === "visa-pause")) || null;
}

/** The small print shown on Country 360 and Markets. */
export const RESTRICTION_SMALL_PRINT =
  "Travel ban: Proclamation 10949 (effective 9 Jun 2025) and Proclamation 10998 (effective 1 Jan 2026) suspend student and exchange (F, M, J) visas for listed nationals; they apply to nationals outside the U.S. without a valid visa on the effective date, and visas issued before then are not revoked. Exceptions include dual nationals applying with a non-restricted passport and case-by-case national-interest exceptions. Temporary pauses may lift without notice — check the State Department. Information only, not legal advice. Last checked 23 Oct 2026.";

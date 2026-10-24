/**
 * Dated, sourced events that may have affected visa trends (Feature 2a), drawn
 * on the existing charts. Entered by hand like `restrictions.ts`; the
 * restriction events (travel bans, the Ebola pause, Turkmenistan restored) are
 * built from `restrictions.ts` so each fact lives in one place.
 *
 * Wording: events "may have affected" trends; never say they caused them.
 */

import {
  PAUSED_POSTS,
  RESTRICTED_NON_COUNTRY,
  RESTRICTIONS,
  restrictionsFor,
  type Restriction,
} from "./restrictions";

export const EVENTS_LAST_CHECKED = "2026-10-23";

export type EventPrecision = "day" | "month" | "year";
export type EventImportance = "major" | "detail";

export interface DashboardEvent {
  id: string;
  /** "2001-09-11" (day), "2008-09" (month) or "2005" (year). */
  start: string;
  /** Last day, month or year of a range, in the same format; omitted for a single date. */
  end?: string;
  precision: EventPrecision;
  /** Short chart label, at most 40 characters. */
  label: string;
  /** One sentence. */
  description: string;
  /** "global", or the dashboard country names it applies to. */
  scope: "global" | readonly string[];
  importance: EventImportance;
  source: string;
  lastChecked: string;
  /** For events built from restrictions.ts: which proclamation or pause. */
  derivedFrom?: "proclamation-10949" | "proclamation-10998" | "visa-pause" | "restored";
}

const event = (e: Omit<DashboardEvent, "lastChecked">): DashboardEvent => ({ ...e, lastChecked: EVENTS_LAST_CHECKED });

/** Events entered by hand (approved list, 2a). */
const MANUAL_EVENTS: DashboardEvent[] = [
  event({
    id: "G1", start: "2001-09-11", precision: "day", importance: "major", scope: "global",
    label: "9/11 attacks",
    description: "The 9/11 attacks were followed by much tighter screening of student visa applicants.",
    source: "https://en.wikipedia.org/wiki/September_11_attacks",
  }),
  event({
    id: "G2", start: "2003-08-01", precision: "day", importance: "detail", scope: "global",
    label: "SEVIS tracking mandatory",
    description: "SEVIS, the federal system that tracks international students and exchange visitors, became mandatory.",
    source: "https://news.mst.edu/?p=878",
  }),
  event({
    id: "G3", start: "2008-09", precision: "month", importance: "major", scope: "global",
    label: "Global financial crisis",
    description: "The global financial crisis deepened in September 2008.",
    source: "https://en.wikipedia.org/wiki/2007%E2%80%932008_financial_crisis",
  }),
  event({
    id: "G4", start: "2016-05-10", precision: "day", importance: "detail", scope: "global",
    label: "STEM OPT extended to 24 months",
    description: "STEM Optional Practical Training was extended to 24 months, giving more post-study work time.",
    source: "https://www.visalawyerblog.com/new-opt-stem-rule-for-f-1-students-effective-may-10-2016/",
  }),
  event({
    id: "G5", start: "2017-01-27", precision: "day", importance: "detail", scope: "global",
    label: "First U.S. travel ban (EO 13769)",
    description: "Executive Order 13769, the first U.S. travel ban, restricted entry from 7 countries.",
    source: "https://en.wikipedia.org/wiki/Executive_Order_13769",
  }),
  event({
    id: "G6", start: "2020-03-20", precision: "day", importance: "major", scope: "global",
    label: "COVID-19: visa services suspended",
    description: "Because of COVID-19, the State Department suspended routine visa services worldwide.",
    source: "https://www.publicradioeast.org/us/2020-03-20/state-department-halts-routine-visa-services-worldwide",
  }),
  event({
    id: "G7", start: "2021-01-20", precision: "day", importance: "detail", scope: "global",
    label: "Earlier travel bans revoked",
    description: "Proclamation 10141 revoked the earlier travel bans.",
    source: "https://ischo.mit.edu/news/biden-administration-revokes-trump-administration-travel-bans",
  }),
  event({
    id: "G8", start: "2024-01-22", precision: "day", importance: "detail", scope: "global",
    label: "Canada caps study permits",
    description: "Canada capped new international student permits, about 35% fewer than the year before.",
    source: "https://ianslive.in/canada-sets-2-year-cap-on-international-student-permits--20240123090005",
  }),
  event({
    id: "G9", start: "2025-05-27", end: "2025-06-18", precision: "day", importance: "major", scope: "global",
    label: "Student visa interview pause",
    description: "New student and exchange visa interviews were paused, then resumed with social-media vetting.",
    source: "https://icenter.tufts.edu/blog/2025/06/23/community-update-f-1-j-1-visa-appointment-resumption/",
  }),
  event({
    id: "G11", start: "2025-09-02", precision: "day", importance: "detail", scope: "global",
    label: "Interview waivers narrowed",
    description: "Most visa applicants must again interview in person, as interview waivers were narrowed.",
    source: "https://iso.mit.edu/news/us-department-of-state-updates-visa-interview-waiver-eligibility-for-most-nonimmigrant-visa-applicants",
  }),
  event({
    id: "G12", start: "2025-09-06", precision: "day", importance: "detail", scope: "global",
    label: "Interview in home country",
    description: "Visa applicants must interview in their country of nationality or residence.",
    source: "https://iss.washington.edu/adjudicating-visa-country-of-residence/",
  }),
  event({
    id: "G14", start: "2026-10-01", precision: "day", importance: "detail", scope: "global",
    label: "Expanded visa vetting",
    description: "Visa screening and vetting were expanded.",
    source: "https://oiss.washu.edu/immigration-updates/",
  }),
  event({
    id: "C1", start: "2005", precision: "year", importance: "major", scope: ["Saudi Arabia"],
    label: "Saudi scholarship program launched",
    description: "Saudi Arabia launched the King Abdullah Scholarship Program for study abroad.",
    source: "https://al-fanarmedia.org/2016/02/slowed-saudi-education-spending-felt-in-u-s/",
  }),
  event({
    id: "C2", start: "2015", end: "2016", precision: "year", importance: "major", scope: ["Saudi Arabia"],
    label: "Saudi scholarships narrowed",
    description: "Saudi Arabia narrowed and cut its scholarship program.",
    source: "https://al-fanarmedia.org/2016/02/slowed-saudi-education-spending-felt-in-u-s/",
  }),
  event({
    id: "C3", start: "2014-11-12", precision: "day", importance: "major", scope: ["China"],
    label: "Chinese student visas valid 5 years",
    description:
      "Chinese student visas valid 5 years instead of 1, so students need fewer renewals; this may mean fewer visas issued for the same number of students.",
    source: "https://isss.emory.edu/about/news/2014/11_13_chinese_visa_extensions.html",
  }),
  event({
    id: "C4", start: "2020-06-01", precision: "day", importance: "major", scope: ["China"],
    label: "Proclamation 10043 (China)",
    description: "Proclamation 10043 blocks some Chinese graduate students and researchers linked to military institutions.",
    source: "https://www.bu.edu/isso/2021/05/20/presidential-proclamation-bans-entry-to-the-us-for-small-number-of-graduate-students-and-researchers-from-china",
  }),
  event({
    id: "C5", start: "2025-05-28", precision: "day", importance: "major", scope: ["China"],
    label: "Chinese student visa revocations",
    description: 'The Secretary of State announced that Chinese student visas will be "aggressively" revoked.',
    source: "https://www.aljazeera.com/news/2025/5/28/marco-rubio-says-us-will-begin-revoking-visas-of-chinese-students",
  }),
  event({
    id: "C6", start: "2019-03", precision: "month", importance: "major", scope: ["Venezuela"],
    label: "By Mar 2019: Caracas visas suspended",
    description: "By March 2019, the U.S. Embassy in Caracas had suspended visa services.",
    source: "https://www.nixonpeabody.com/insights/articles/2019/03/05/dos-announces-suspension-of-visa-services-in-caracas-venezuela",
  }),
  event({
    id: "C7", start: "2021-08-01", precision: "day", importance: "major", scope: ["Russia"],
    label: "U.S. Embassy Moscow halts visa services",
    description: "The U.S. Embassy in Moscow halted visa and consular services from 1 August 2021 after Russia barred it from employing local staff.",
    source: "https://www.themoscowtimes.com/2021/06/28/us-embassy-in-moscow-to-halt-visa-consular-services-from-aug-1-a74354",
  }),
  event({
    id: "C8", start: "2021-08-31", precision: "day", importance: "major", scope: ["Afghanistan"],
    label: "Embassy Kabul suspends operations",
    description: "The U.S. Embassy in Kabul suspended operations.",
    source: "https://www.iandoli.com/newsandupdates/dos-provides-update-on-us-embassy-kabul-all-embassy-operations-suspended952021",
  }),
  event({
    id: "C9", start: "2022-02", precision: "month", importance: "major", scope: ["Ukraine"],
    label: "Embassy Kyiv suspends operations",
    description: "The U.S. Embassy in Kyiv suspended operations after Russia's invasion of Ukraine.",
    source: "https://en.wikipedia.org/wiki/Embassy_of_the_United_States,_Kyiv",
  }),
];

/* ---- Built from restrictions.ts ---- */

const P10949 = "2025-06-09";
const P10998 = "2026-01-01";

/** Countries whose student and exchange visas were suspended under Proclamation 10949 (including Turkmenistan, since restored). */
export const proclamation10949Countries = (): string[] =>
  [
    ...new Set(
      RESTRICTIONS.filter(
        (r) => r.type === "travel-ban" && (r.suspendedSince === P10949 || r.restored?.suspendedFrom === P10949),
      ).map((r) => r.country),
    ),
  ].sort();

/** Countries listed under Proclamation 10998 (effective 1 Jan 2026), any level. */
export const proclamation10998Countries = (): string[] =>
  [...new Set(RESTRICTIONS.filter((r) => r.type === "travel-ban" && r.effective === P10998).map((r) => r.country))].sort();

const sourceOf = (r: Restriction | undefined, title: RegExp) =>
  r?.sources.find((s) => title.test(s.title))?.url ?? "";

function restrictionEvents(): DashboardEvent[] {
  const bans = RESTRICTIONS.filter((r) => r.type === "travel-ban");
  const p10949 = proclamation10949Countries();
  const p10998 = bans.filter((r) => r.effective === P10998 && r.studentVisasAffected);
  const full = p10998.filter((r) => r.level === "full").length;
  const partial = p10998.filter((r) => r.level === "partial").length;
  const immigrantOnly = bans.filter((r) => r.level === "immigrant-only").map((r) => r.country);
  const anyBan = bans.find((r) => r.sources.length > 1);
  const pauses = RESTRICTIONS.filter((r) => r.type === "visa-pause");
  const restored = RESTRICTIONS.filter((r) => r.restored);
  const nonCountry = RESTRICTED_NON_COUNTRY.map((n) => n.replace(/ Travel Document$/, " travel documents"));

  const out: DashboardEvent[] = [
    event({
      id: "G10", start: P10949, precision: "day", importance: "major", scope: "global",
      label: "Travel ban (Proclamation 10949)",
      description: `Proclamation 10949 suspended student and exchange visas for nationals of ${p10949.length} countries.`,
      source: sourceOf(anyBan, /10949/),
      derivedFrom: "proclamation-10949",
    }),
    event({
      id: "G13", start: P10998, precision: "day", importance: "major", scope: "global",
      label: "Expanded travel ban (Proclamation 10998)",
      description: `Proclamation 10998 suspends student and exchange visas for nationals of ${p10998.length} countries (${full} full, ${partial} partial) and ${nonCountry.join(", ")}${immigrantOnly.length > 0 ? `, and restricts only immigrant visas for ${immigrantOnly.join(", ")}` : ""}.`,
      source: sourceOf(anyBan, /10998/),
      derivedFrom: "proclamation-10998",
    }),
  ];
  if (pauses.length > 0) {
    const p = pauses[0];
    const posts = Object.keys(PAUSED_POSTS).join(", ");
    out.push(
      event({
        id: "R-PAUSE", start: p.effective, precision: "day", importance: "major",
        scope: pauses.map((x) => x.country),
        label: `${p.reason ?? "Temporary"}: visa services paused`,
        description: `All U.S. visa services were paused at ${posts}${p.reason ? ` because of ${p.reason}` : ""}, with no end date announced.`,
        source: p.sources[0].url,
        derivedFrom: "visa-pause",
      }),
    );
  }
  for (const r of restored) {
    out.push(
      event({
        id: `R-RESTORED-${r.country.replace(/\W+/g, "")}`, start: r.restored!.restoredOn, precision: "day", importance: "major",
        scope: [r.country],
        label: "Student/exchange visas restored",
        description: r.history.replace(/\s*\(Proclamation 10998\)\.$/, "."),
        source: sourceOf(r, /10998/),
        derivedFrom: "restored",
      }),
    );
  }
  return out;
}

/** Every event, in date order. */
export const EVENTS: readonly DashboardEvent[] = [...MANUAL_EVENTS, ...restrictionEvents()].sort(
  (a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id),
);

/** A country's own line on a global restriction event, e.g. Nigeria on Proclamation 10998. */
export function countryNote(e: DashboardEvent, country: string | null): string | null {
  if (!country) return null;
  const ban = restrictionsFor(country).find((r) => r.type === "travel-ban");
  if (!ban) return null;
  if (e.derivedFrom === "proclamation-10949" && proclamation10949Countries().includes(country)) return `${country}: ${ban.history}`;
  if (e.derivedFrom === "proclamation-10998" && proclamation10998Countries().includes(country)) return `${country}: ${ban.history}`;
  return null;
}

/* ---- Dates ---- */

const parts = (date: string) => {
  const [year, month = 1, day = 1] = date.split("-").map(Number);
  return { year, month, day };
};

/** The month index (year * 12 + month - 1) an event starts in. */
export const startMonthIndex = (e: DashboardEvent): number => {
  const p = parts(e.start);
  return p.year * 12 + p.month - 1;
};

/** The month index an event ends in (its start month for a single date). */
export const endMonthIndex = (e: DashboardEvent): number => {
  if (!e.end) return startMonthIndex(e);
  const p = parts(e.end);
  return p.year * 12 + (e.precision === "year" ? 12 : p.month) - 1;
};

/**
 * The fiscal year (Oct–Sep) of a date: 2014-11-12 → FY2015, 2020-03-20 → FY2020.
 * A year-only date is placed in the fiscal year of the same number (2005 → FY2005).
 */
export function fiscalYearOf(date: string, precision: EventPrecision): number {
  const p = parts(date);
  if (precision === "year") return p.year;
  return p.month >= 10 ? p.year + 1 : p.year;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20 Mar 2020", "Sep 2008", "2005", "27 May – 18 Jun 2025", "2015 – 2016". */
export function eventDateText(e: DashboardEvent): string {
  const one = (date: string) => {
    const p = parts(date);
    if (e.precision === "year") return String(p.year);
    if (e.precision === "month") return `${MONTHS[p.month - 1]} ${p.year}`;
    return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
  };
  if (!e.end) return one(e.start);
  const a = one(e.start);
  const b = one(e.end);
  if (e.precision === "day" && a.slice(-4) === b.slice(-4)) return `${a.slice(0, -5)} – ${b}`;
  return `${a} – ${b}`;
}

/** The source's site, for hover text: "travel.state.gov". */
export const sourceSite = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/* ---- Which events a chart shows ---- */

export const appliesTo = (e: DashboardEvent, country: string | null): boolean =>
  e.scope === "global" || (country !== null && e.scope.includes(country));

export interface EventSelection {
  /** The chart's country, for its own events; null = global events only. */
  country: string | null;
  /** Include global "detail" events (Country 360) or only "major" ones (Historical Trends, Consulates). */
  globalDetail: boolean;
}

export const selectEvents = (sel: EventSelection): DashboardEvent[] =>
  EVENTS.filter((e) => appliesTo(e, sel.country) && (e.scope !== "global" || sel.globalDetail || e.importance === "major"));

/* ---- The overlay: lines, bands, labels and hover ---- */

export type EventAxis =
  /** A monthly date axis over these month indexes. */
  | { kind: "month"; start: number; end: number }
  /** A fiscal-year axis (numbers). */
  | { kind: "fiscalYear"; start: number; end: number }
  /** A category axis of calendar years, e.g. "2019", …, "2026 Jan–Feb". */
  | { kind: "calendarYear"; categories: ReadonlyArray<{ label: string; year: number }> };

export interface PlacedEvent {
  event: DashboardEvent;
  /** Where the line (or band start) sits on the axis. */
  x: number | string;
  /** Band end, for ranges that span more than one position. */
  x1?: number | string;
  /** The position used to group events and for hover. */
  key: number | string;
  labelled: boolean;
  note: string | null;
}

export interface EventOverlay {
  shapes: Record<string, unknown>[];
  annotations: Record<string, unknown>[];
  traces: Record<string, unknown>[];
  /** Label rows used above the plot (0–3). */
  rows: number;
  /** Events drawn, in date order. */
  shown: PlacedEvent[];
  /** Events after the chart's last point or after the data ends: listed, not drawn. */
  later: DashboardEvent[];
}

export const EMPTY_OVERLAY: EventOverlay = { shapes: [], annotations: [], traces: [], rows: 0, shown: [], later: [] };

const pad = (n: number) => String(n).padStart(2, "0");
const monthDate = (index: number) => `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;

/** The exact date string of an event edge, for a date axis. */
function exactDate(e: DashboardEvent, edge: "start" | "end"): string {
  const raw = edge === "start" ? e.start : (e.end ?? e.start);
  const p = parts(raw);
  if (edge === "start") return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  // The end of a range is inclusive: draw to the end of that day, month or year.
  if (e.precision === "year") return `${p.year + 1}-01-01`;
  if (e.precision === "month") return monthDate(p.year * 12 + p.month);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Events drawn without a label on yearly charts (they already have their own marking). */
const UNLABELLED_ON_YEARLY = new Set(["G6"]);

const LABEL_ROWS = 3;
const ROW_PX = 17;
/** Conservative plot width for spacing labels (narrower than a desktop chart). */
const PLOT_PX = 720;
const CHAR_PX = 6.2;

export interface OverlayOptions extends EventSelection {
  axis: EventAxis;
  /** The data's last month (month index): later events are listed, not drawn. */
  dataEnd: number;
}

/**
 * Places the selected events on a chart: a thin dashed line (or a shaded band
 * for ranges), a short label for major and country events in up to three rows
 * above the plot, and an invisible hover layer with the description, date and
 * source. Events outside the chart's range, or after the data ends, are never
 * drawn; later ones are returned in `later`.
 */
export function eventOverlay(opts: OverlayOptions): EventOverlay {
  const { axis, dataEnd, country } = opts;
  const yearly = axis.kind !== "month";
  const shown: PlacedEvent[] = [];
  const later: DashboardEvent[] = [];

  for (const e of selectEvents(opts)) {
    const startIdx = startMonthIndex(e);
    let placed: Omit<PlacedEvent, "labelled" | "note"> | null = null;
    let isLater = startIdx > dataEnd;
    if (axis.kind === "month") {
      if (startIdx > axis.end) isLater = true;
      else if (!isLater && startIdx >= axis.start) {
        placed = {
          event: e,
          x: exactDate(e, "start"),
          x1: e.end ? exactDate(e, "end") : undefined,
          key: monthDate(startIdx),
        };
      }
    } else if (axis.kind === "fiscalYear") {
      const fy0 = fiscalYearOf(e.start, e.precision);
      const fy1 = e.end ? fiscalYearOf(e.end, e.precision) : fy0;
      if (fy0 > axis.end) isLater = true;
      else if (!isLater && fy1 >= axis.start) {
        const a = Math.max(fy0, axis.start);
        const b = Math.min(fy1, axis.end);
        placed = { event: e, x: a, x1: b > a ? b : undefined, key: a };
      }
    } else {
      const year = parts(e.start).year;
      const last = axis.categories.at(-1);
      const category = axis.categories.find((c) => c.year === year);
      if (last && year > last.year) isLater = true;
      else if (!isLater && category) placed = { event: e, x: category.label, key: category.label };
    }
    if (isLater) later.push(e);
    else if (placed) {
      const labelled =
        (e.scope !== "global" || e.importance === "major") && !(yearly && UNLABELLED_ON_YEARLY.has(e.id));
      shown.push({ ...placed, labelled, note: countryNote(e, country) });
    }
  }

  if (shown.length === 0) return { ...EMPTY_OVERLAY, later };

  // Lines and bands.
  const shapes: Record<string, unknown>[] = [];
  for (const p of shown) {
    const strong = p.labelled || p.event.scope !== "global";
    if (p.x1 !== undefined && axis.kind !== "calendarYear") {
      const yearPad = axis.kind === "fiscalYear" ? 0.45 : 0;
      shapes.push({
        type: "rect", xref: "x", yref: "paper",
        x0: typeof p.x === "number" ? p.x - yearPad : p.x,
        x1: typeof p.x1 === "number" ? p.x1 + yearPad : p.x1,
        y0: 0, y1: 1, fillcolor: "#A78BFA", opacity: 0.12, line: { width: 0 }, layer: "below",
      });
    } else {
      shapes.push({
        type: "line", xref: "x", yref: "paper", x0: p.x, x1: p.x, y0: 0, y1: 1,
        line: { color: strong ? "rgba(196,181,253,0.7)" : "rgba(196,181,253,0.35)", width: 1, dash: strong ? "dash" : "dot" },
        layer: "below",
      });
    }
  }

  // One group per position: one label and one hover point.
  const groups = new Map<string, PlacedEvent[]>();
  for (const p of shown) {
    const k = String(p.key);
    const list = groups.get(k);
    if (list) list.push(p);
    else groups.set(k, [p]);
  }

  const fraction = (key: number | string): number => {
    if (axis.kind === "month") {
      const [y, m] = String(key).split("-").map(Number);
      return (y * 12 + m - 1 - axis.start + 0.5) / (axis.end - axis.start + 1);
    }
    if (axis.kind === "fiscalYear") return (Number(key) - axis.start + 0.5) / (axis.end - axis.start + 1);
    const i = axis.categories.findIndex((c) => c.label === key);
    return (i + 0.5) / axis.categories.length;
  };

  // Labels: left to right, in the first of three rows where they fit; otherwise hover only.
  const occupied: Array<Array<[number, number]>> = Array.from({ length: LABEL_ROWS }, () => []);
  const annotations: Record<string, unknown>[] = [];
  let rows = 0;
  const hoverX: Array<number | string> = [];
  const hoverText: string[] = [];
  const keys = [...groups.keys()].sort((a, b) => fraction(a) - fraction(b));
  for (const k of keys) {
    const group = groups.get(k)!;
    const lead = group.find((p) => p.labelled);
    hoverX.push(group[0].key);
    hoverText.push(
      group
        .map((p) => {
          const lines = [`<b>${p.event.label}</b> (${eventDateText(p.event)})`, wrap(p.event.description)];
          if (p.note) lines.push(wrap(p.note));
          lines.push(`Source: ${sourceSite(p.event.source)}`);
          return lines.join("<br>");
        })
        .join("<br><br>"),
    );
    if (!lead) continue;
    const text = group.length > 1 ? `${lead.event.label} +${group.length - 1}` : lead.event.label;
    const width = (text.length * CHAR_PX + 10) / PLOT_PX;
    const f = fraction(k);
    const rightSide = f + width > 1;
    const span: [number, number] = rightSide ? [f - width, f] : [f, f + width];
    const row = occupied.findIndex((taken) => taken.every(([a, b]) => span[1] <= a || span[0] >= b));
    if (row === -1) continue;
    occupied[row].push(span);
    rows = Math.max(rows, row + 1);
    annotations.push({
      x: lead.x, xref: "x", y: 1, yref: "paper", yanchor: "bottom",
      yshift: 3 + row * ROW_PX,
      xanchor: rightSide ? "right" : "left",
      text, showarrow: false,
      font: { color: "#DDD6FE", size: 10 },
      bgcolor: "rgba(7, 21, 46, 0.85)",
      hovertext: group.map((p) => p.event.label).join("; "),
    });
  }

  const traces: Record<string, unknown>[] = [
    {
      type: "scatter",
      mode: "markers",
      name: "Events",
      x: hoverX,
      y: hoverX.map(() => 0.985),
      yaxis: "y2",
      customdata: hoverText,
      marker: { symbol: "diamond", size: 7, color: "#C4B5FD", line: { width: 0 } },
      hovertemplate: "%{customdata}<extra>Event (may have affected trends)</extra>",
      showlegend: false,
    },
  ];

  return { shapes, annotations, traces, rows, shown, later };
}

/** Breaks long hover lines near 70 characters. */
function wrap(text: string, width = 70): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && line.length + w.length + 1 > width) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.join("<br>");
}

/**
 * A chart's traces and layout with the overlay added: existing traces, shapes and
 * annotations are kept as they are; the label rows get room above the plot.
 */
export function withEvents<L extends Record<string, unknown>>(
  traces: readonly Record<string, unknown>[],
  layout: L,
  overlay: EventOverlay,
): { traces: Record<string, unknown>[]; layout: L } {
  if (overlay.shown.length === 0) return { traces: [...traces], layout };
  const title = typeof layout.title === "object" && layout.title !== null ? layout.title : { text: layout.title };
  const margin = (typeof layout.margin === "object" && layout.margin !== null ? layout.margin : {}) as Record<string, unknown>;
  return {
    traces: [...traces, ...overlay.traces],
    layout: {
      ...layout,
      shapes: [...((layout.shapes as unknown[]) ?? []), ...overlay.shapes],
      annotations: [...((layout.annotations as unknown[]) ?? []), ...overlay.annotations],
      yaxis2: { overlaying: "y", range: [0, 1], visible: false, fixedrange: true },
      // Room for the label rows between the title and the plot.
      margin: { ...margin, t: (typeof margin.t === "number" ? margin.t : 72) + overlay.rows * ROW_PX + 4 },
      title: { ...title, y: 1, yref: "container", yanchor: "top", pad: { t: 12 } },
    },
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES, VISA_COLORS } from "../../../lib/dashboard/constants";
import {
  buildConsulateTable,
  consulateContext,
  previousPeriod,
  recoveryYearOf,
  sameMonthsLabel,
  type ConsulateRow,
} from "../../../lib/dashboard/consulates";
import {
  int,
  metricNumber,
  metricPct,
  monthDisplay,
  monthLongDisplay,
  perMonthText,
  share,
} from "../../../lib/dashboard/format";
import {
  LOW_VOLUME,
  MIN_BASE,
  averagePerMonthIn,
  monthlySeries,
  typicalYear,
  volatilityIn,
} from "../../../lib/dashboard/measures";
import {
  groupSum,
  peakMonthLabel,
  recommendedOutreachWindow,
  seasonalityStrengthLabel,
  selectedVisaClasses,
  sumBy,
  volatilityLabel,
} from "../../../lib/dashboard/metrics";
import { averagePerMonth, calendarMonthYearCounts, calendarYearLabel } from "../../../lib/dashboard/periods";
import {
  MOVER_MIN_ISSUANCES,
  arrowPct,
  monthRangeLabel,
  risersAndFallers,
  rollingTotals,
} from "../../../lib/dashboard/rolling";
import { consulateScopeNotes, pausedPostText } from "../../../lib/dashboard/restrictions";
import type { PostMonthlyRow } from "../../../lib/dashboard/types";
import { EMPTY_OVERLAY, eventOverlay, withEvents } from "../../../lib/dashboard/events";
import Chart from "../Chart";
import { EventsList, EventsToggle } from "../EventsControls";
import ComparePicker from "../ComparePicker";
import { PausedPostBadge } from "../RestrictionBadges";
import { useDashboard } from "../DashboardContext";
import { Caption, DownloadCsvButton, InfoCallout, SubHeading } from "../shared";
import {
  DataTable,
  Expander,
  FixedTag,
  KpiCard,
  KpiRow,
  Panel,
  SectionTitle,
  Select,
} from "../ui";

type Scope = "country" | "all";
type TrendMode = "monthly" | "annual" | "same";
const SORTS = ["Volume", "Change", "Share", "Recovery"] as const;
type Sort = (typeof SORTS)[number];
const TOP_CHOICES = [3, 5, 8] as const;
const COMPARE_MAX = 8;

const HEAT_SCALE: Array<[number, string]> = [
  [0, "#040F22"],
  [0.3, "#0D3B7A"],
  [0.7, "#3D8DDE"],
  [1, "#FFB81C"],
];

/** First day of a `year * 12 + (month - 1)` month, for a Plotly date axis. */
const monthDate = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;

/** A readable monthly date axis: yearly ticks for long spans. */
const dateAxis = (months: number) => ({
  title: { text: "Month" },
  type: "date",
  tickformat: "%b %Y",
  hoverformat: "%b %Y",
  dtick: months > 36 ? "M12" : months > 12 ? "M3" : "M1",
  tickangle: -45,
});

/** Reads the page's own settings (consulate, scope) from the web address once. */
function readPageParams(): { consulate: string | null; scope: Scope } {
  if (typeof window === "undefined") return { consulate: null, scope: "country" };
  const params = new URLSearchParams(window.location.search);
  return {
    consulate: params.get("consulate"),
    scope: params.get("scope") === "all" ? "all" : "country",
  };
}

/**
 * Consulates: which consulates in a market issue visas, and is that going up or
 * down. Merges the former Consulate Intelligence and Historical Consulates
 * pages. Scope, the selected consulate and the compared consulates are page
 * settings; country, visa and period come from the control bar.
 */
export default function ConsulatesPage() {
  const {
    data,
    focusCountry,
    visa,
    visaLabel,
    periodRange,
    typical,
    consulateCountries,
    showEvents,
  } = useDashboard();

  const [initial] = useState(readPageParams);
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [chosenPost, setChosenPost] = useState<string | null>(initial.consulate);
  const [sortBy, setSortBy] = useState<Sort>("Volume");
  const [trendMode, setTrendMode] = useState<TrendMode>("monthly");
  const [topN, setTopN] = useState<number>(5);
  // Picked consulates belong to one scope; changing the scope or country resets them.
  const scopeKey = scope === "all" ? "all" : `country:${focusCountry}`;
  const [compareChoice, setCompareChoice] = useState<{ key: string; posts: string[] } | null>(null);

  const coverage = data.meta.coverage.postsMonthly;
  const visas = useMemo(() => selectedVisaClasses(visa), [visa]);
  const visaRows = useMemo(
    () => data.postsMonthly.filter((r) => visas.includes(r.visa)),
    [data.postsMonthly, visas],
  );
  const prior = previousPeriod(periodRange, coverage);
  const recoveryYear = recoveryYearOf(coverage);
  /** Recovery index; "— (low volume)" when the consulate had fewer than 100 issuances in 2019. */
  const recoveryCell = (value: number | null) =>
    value !== null ? value.toFixed(0) : recoveryYear === null ? "—" : LOW_VOLUME;
  const scopeCountry = scope === "country" ? focusCountry : null;
  const scopeName = scopeCountry ?? "all countries";

  /* ---- 1. Ranked consulates ---- */
  const table = useMemo(
    () => buildConsulateTable(visaRows, periodRange, prior, scopeCountry, recoveryYear),
    [visaRows, periodRange, prior, scopeCountry, recoveryYear],
  );
  const sorted = useMemo(() => {
    const key: Record<Sort, (r: ConsulateRow) => number | null> = {
      Volume: (r) => r.volume,
      Change: (r) => r.change,
      Share: (r) => r.share,
      Recovery: (r) => r.recovery,
    };
    return [...table].sort((a, b) => {
      const x = key[sortBy](a);
      const y = key[sortBy](b);
      if (x === null && y === null) return b.volume - a.volume;
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x || b.volume - a.volume;
    });
  }, [table, sortBy]);
  const scopeTotal = sumBy(table, (r) => r.volume);

  const posts = useMemo(() => table.map((r) => r.post), [table]);
  const selectedPost = chosenPost && posts.includes(chosenPost) ? chosenPost : (posts[0] ?? null);
  const selectedRow = table.find((r) => r.post === selectedPost) ?? null;

  // Keep the page's own settings in the web address (the shell keeps country,
  // visa, period and tab).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedPost) params.set("consulate", selectedPost);
    else params.delete("consulate");
    params.set("scope", scope);
    const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [selectedPost, scope]);

  /* ---- Context line: where issued vs who received ---- */
  const context = useMemo(
    () =>
      scope === "country"
        ? consulateContext(data.postsMonthly, data.nationalityMonthly, focusCountry, periodRange, visas)
        : null,
    [scope, data.postsMonthly, data.nationalityMonthly, focusCountry, periodRange, visas],
  );

  /* ---- 2. Trend: compared consulates ---- */
  const topPosts = useMemo(() => posts.slice(0, topN), [posts, topN]);
  const compared = useMemo(
    () =>
      compareChoice?.key === scopeKey ? compareChoice.posts.filter((p) => posts.includes(p)) : topPosts,
    [compareChoice, scopeKey, posts, topPosts],
  );
  const throughLabel = sameMonthsLabel(coverage.end);
  const throughMonth = (coverage.end % 12) + 1;

  const trend = useMemo(() => {
    const byPost = new Map<string, PostMonthlyRow[]>();
    for (const row of visaRows) {
      if (!compared.includes(row.post)) continue;
      const list = byPost.get(row.post);
      if (list) list.push(row);
      else byPost.set(row.post, [row]);
    }
    const firstYear = Math.floor(coverage.start / 12);
    const lastYear = Math.floor(coverage.end / 12);

    if (trendMode === "monthly") {
      const traces: Trace[] = compared.map((post) => {
        // Every month of the coverage: the line drops to 0 where there were no visas.
        const values = monthlySeries(byPost.get(post) ?? [], coverage);
        return {
          type: "scatter",
          mode: "lines",
          name: post,
          x: values.map((_, i) => monthDate(coverage.start + i)),
          y: values,
          line: { width: post === selectedPost ? 4 : 2 },
          hovertemplate: `${post}: %{y:,.0f}<extra></extra>`,
        };
      });
      const layout: ChartLayout = {
        height: 460,
        title: {
          text: `Monthly ${visaLabel} issuances by consulate<br><sup>${monthRangeLabel(coverage)} · shaded: ${periodRange.label}</sup>`,
        },
        hovermode: "x unified",
        xaxis: dateAxis(coverage.end - coverage.start + 1),
        yaxis: { title: { text: "Issuances" } },
        legend: { title: { text: "Consulate" } },
        shapes: [
          {
            type: "rect",
            xref: "x",
            yref: "paper",
            x0: monthDate(periodRange.start),
            x1: monthDate(periodRange.end + 1),
            y0: 0,
            y1: 1,
            fillcolor: "#FFB81C",
            opacity: 0.12,
            line: { width: 0 },
            layer: "below",
          },
        ],
      };
      return { traces, layout };
    }

    // Annual: calendar years, partial years labelled. Same months: only the
    // months the latest year has so far, in every year that has all of them.
    const years: number[] = [];
    for (let year = firstYear; year <= lastYear; year += 1) {
      if (trendMode === "same" && year * 12 < coverage.start) continue;
      years.push(year);
    }
    const label = (year: number) =>
      trendMode === "same" && throughLabel ? `${year} (${throughLabel})` : calendarYearLabel(year, coverage);
    const traces: Trace[] = compared.map((post) => {
      const rows = (byPost.get(post) ?? []).filter((r) => trendMode !== "same" || r.month <= throughMonth);
      const totals = groupSum(rows, (r) => r.year, (r) => r.issuances);
      return {
        type: "scatter",
        mode: "lines+markers",
        name: post,
        x: years.map(label),
        y: years.map((year) => totals.get(year) ?? 0),
        line: { width: post === selectedPost ? 4 : 2 },
        hovertemplate: `${post}: %{y:,.0f}<extra></extra>`,
      };
    });
    const layout: ChartLayout = {
      height: 460,
      title: {
        text:
          trendMode === "same"
            ? `${visaLabel} issuances by consulate, ${throughLabel} of each year`
            : `${visaLabel} issuances by consulate, calendar years`,
      },
      hovermode: "x unified",
      xaxis: { type: "category", title: { text: "Year" } },
      yaxis: { title: { text: "Issuances" } },
      legend: { title: { text: "Consulate" } },
    };
    return { traces, layout };
  }, [visaRows, compared, trendMode, coverage, selectedPost, visaLabel, periodRange, throughLabel, throughMonth]);

  // Events (2a): monthly mode in "This country" scope only: the country's own
  // events and global "major" ones.
  const eventsOn = trendMode === "monthly" && scope === "country";
  const trendEvents = useMemo(
    () =>
      showEvents && eventsOn
        ? eventOverlay({
            axis: { kind: "month", start: coverage.start, end: coverage.end },
            dataEnd: coverage.end,
            country: focusCountry,
            globalDetail: false,
          })
        : EMPTY_OVERLAY,
    [showEvents, eventsOn, coverage.start, coverage.end, focusCountry],
  );
  const trendChart = useMemo(() => withEvents(trend.traces, trend.layout, trendEvents), [trend, trendEvents]);

  const partialYears = useMemo(() => {
    const labels: string[] = [];
    for (let year = Math.floor(coverage.start / 12); year <= Math.floor(coverage.end / 12); year += 1) {
      const label = calendarYearLabel(year, coverage);
      if (label !== String(year)) labels.push(label);
    }
    return labels;
  }, [coverage]);

  /* ---- 3. Risers and fallers: always last 12 months, F1, in the scope ---- */
  const movers = useMemo(() => {
    const rolling = rollingTotals(data.postsMonthly, coverage.end, (r) =>
      r.visa === "F1" && (scopeCountry === null || r.country === scopeCountry) ? r.post : null,
    );
    const { risers, fallers, qualifying } = risersAndFallers(rolling.groups);
    const chart = (rows: typeof risers, title: string, color: string) => ({
      count: rows.length,
      data: [
        {
          type: "bar",
          orientation: "h",
          x: rows.map(([, g]) => g.change),
          y: rows.map(([post]) => post),
          text: rows.map(([, g]) => arrowPct(g.change)),
          textposition: "auto",
          customdata: rows.map(([, g]) => [int(g.current), int(g.prior)]),
          marker: { color },
          hovertemplate:
            "<b>%{y}</b><br>Change: %{x:.1f}%<br>" +
            `${monthRangeLabel(rolling.current)}: %{customdata[0]}<br>` +
            `${monthRangeLabel(rolling.prior)}: %{customdata[1]}<extra></extra>`,
        } as Trace,
      ],
      layout: {
        height: Math.max(220, 60 + rows.length * 32),
        title: { text: title },
        xaxis: { title: { text: "% change vs previous 12 months" }, ticksuffix: "%" },
        yaxis: { autorange: "reversed" },
      } as ChartLayout,
    });
    return {
      period: monthRangeLabel(rolling.current),
      qualifying,
      risers: chart(risers, "Top risers - F1 vs previous 12 months", "#4ADE80"),
      fallers: chart(fallers, "Top fallers - F1 vs previous 12 months", "#F87171"),
    };
  }, [data.postsMonthly, coverage.end, scopeCountry]);

  /* ---- 4. Typical-year heatmap ---- */
  const heatmapPosts = useMemo(() => (scope === "country" ? posts : topPosts), [scope, posts, topPosts]);
  const heatmap = useMemo(() => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const counts = calendarMonthYearCounts(typical.rows);
    const totals = groupSum(
      typical.rows.filter((r) => heatmapPosts.includes(r.post)),
      (r) => `${r.post}|${r.month}`,
      (r) => r.issuances,
    );
    const z = heatmapPosts.map((post) =>
      months.map((m) => averagePerMonth(totals.get(`${post}|${m}`) ?? 0, m, counts)),
    );
    return {
      data: [
        {
          type: "heatmap",
          z,
          x: months.map((m) => MONTH_NAMES[m]),
          y: heatmapPosts,
          colorscale: HEAT_SCALE,
          texttemplate: "%{z:.0f}",
          textfont: { size: 10 },
          hovertemplate: "<b>%{y}</b><br>%{x}: %{z:,.0f} average per month (typical year)<extra></extra>",
        } as Trace,
      ],
      layout: {
        height: Math.max(260, 90 + heatmapPosts.length * 34),
        title: { text: `${visaLabel} issuances by month, typical year` },
        yaxis: { autorange: "reversed" },
      } as ChartLayout,
    };
  }, [typical, heatmapPosts, visaLabel]);

  /* ---- 5. Consulate detail ---- */
  const selectedHistory = useMemo(
    () => visaRows.filter((r) => r.post === selectedPost),
    [visaRows, selectedPost],
  );
  const selectedPeriodRows = selectedHistory.filter(
    (r) => r.monthIndex >= periodRange.start && r.monthIndex <= periodRange.end,
  );
  // The shared typical-year peak; "— (low volume)" under 100 visas in an average typical year.
  const selectedTypical = useMemo(
    () => typicalYear(selectedHistory, typical.years),
    [selectedHistory, typical.years],
  );
  const typicalPeak = selectedTypical.peakMonth;
  const recoveryLabel = recoveryYear !== null ? `Recovery (${recoveryYear} vs 2019)` : "Recovery (vs 2019)";
  const changeLabel = prior
    ? `Change vs ${monthRangeLabel(prior)}`
    : "Change vs previous period";
  const noPriorNote = prior
    ? null
    : `No previous period of the same length: the data starts ${monthDisplay(coverage.start)}.`;

  // More details: the selected consulate's own figures for the Period.
  // Volatility and the average use every month of the Period, missing months as 0.
  const periodVolatility = volatilityLabel(volatilityIn(selectedPeriodRows, periodRange));
  const monthsWithIssuances = new Set(selectedPeriodRows.map((r) => r.monthIndex)).size;
  // The data's last month (the same for every consulate), not this consulate's own last row.
  const latestIndex = selectedHistory.length > 0 ? coverage.end : null;
  const latestMonthTotal =
    latestIndex !== null
      ? sumBy(selectedHistory.filter((r) => r.monthIndex === latestIndex), (r) => r.issuances)
      : null;
  const averageMonthly = selectedPeriodRows.length > 0 ? averagePerMonthIn(selectedPeriodRows, periodRange) : null;

  const splitChart = useMemo(() => {
    const rows = data.postsMonthly.filter((r) => r.post === selectedPost);
    const traces: Trace[] = (["F1", "J1"] as const).map((v) => {
      // Every month of the coverage: the line drops to 0 where there were no visas.
      const values = monthlySeries(rows.filter((r) => r.visa === v), coverage);
      return {
        type: "scatter",
        mode: "lines",
        name: v,
        x: values.map((_, i) => monthDate(coverage.start + i)),
        y: values,
        line: { color: VISA_COLORS[v], width: 2 },
      };
    });
    return {
      traces,
      layout: {
        height: 360,
        title: { text: `F1 and J1 by month - ${selectedPost ?? ""}` },
        hovermode: "x unified",
        xaxis: dateAxis(coverage.end - coverage.start + 1),
        yaxis: { title: { text: "Issuances" } },
      } as ChartLayout,
    };
  }, [data.postsMonthly, selectedPost, coverage]);

  const recoveryChart = useMemo(() => {
    const traces: Trace[] = [];
    for (const v of visas) {
      const rows = selectedHistory.filter((r) => r.visa === v);
      const base = sumBy(rows.filter((r) => r.year === 2019), (r) => r.issuances);
      if (base < MOVER_MIN_ISSUANCES) continue;
      // Every complete year from 2019, so a consulate that stopped drops to 0.
      const totals = groupSum(rows, (r) => r.year, (r) => r.issuances);
      const years: number[] = [];
      for (let y = 2019; y <= Math.floor(coverage.end / 12); y += 1) {
        if (calendarYearLabel(y, coverage) === String(y)) years.push(y);
      }
      traces.push({
        type: "scatter",
        mode: "lines+markers",
        name: v,
        x: years.map(String),
        y: years.map((y) => ((totals.get(y) ?? 0) / base) * 100),
        line: { color: VISA_COLORS[v], width: 3 },
        hovertemplate: `${v} %{x}: %{y:.0f} (100 = 2019 level)<extra></extra>`,
      });
    }
    return {
      traces,
      layout: {
        height: 340,
        title: { text: "Recovery index by calendar year (100 = 2019 level)" },
        xaxis: { type: "category", title: { text: "Year" } },
        yaxis: { title: { text: "Index" } },
        shapes: [
          { type: "line", xref: "paper", x0: 0, x1: 1, y0: 100, y1: 100, line: { dash: "dot", color: "#FFB81C" } },
        ],
      } as ChartLayout,
    };
  }, [visas, selectedHistory, coverage]);

  const peakName = peakMonthLabel(selectedTypical);
  const insights: string[] = [];
  if (selectedRow) {
    insights.push(
      `${selectedRow.post} issued ${int(selectedRow.volume)} ${visaLabel} visas in ${periodRange.inSentence}, ${share(selectedRow.countryShare / 100)} of ${selectedRow.country}'s consulate total.`,
    );
    if (selectedRow.change !== null && prior) {
      insights.push(`That is ${metricPct(selectedRow.change)} vs ${monthRangeLabel(prior)}.`);
    }
    if (selectedRow.recovery !== null) {
      insights.push(`Its ${recoveryYear} total is ${selectedRow.recovery.toFixed(0)}% of its 2019 level.`);
    }
    if (typicalPeak !== null) {
      insights.push(`In a typical year (${typical.label}) its busiest month is ${peakName}.`);
    }
  }
  const admissionsCards: Array<[string, string]> = [
    [
      "Recruitment timing",
      typicalPeak !== null
        ? `Recommended outreach: ${recommendedOutreachWindow(typicalPeak)}, ahead of the typical ${peakName} peak.`
        : "Not enough typical-year data for a timing recommendation.",
    ],
    ["Workload planning", `Peak issuance month (typical year): ${peakName}.`],
    [
      "Momentum",
      selectedRow?.change !== null && selectedRow?.change !== undefined && prior
        ? `${arrowPct(selectedRow.change)} vs ${monthRangeLabel(prior)}.`
        : prior && selectedRow
          ? `${LOW_VOLUME}: fewer than ${MIN_BASE} issuances in ${monthRangeLabel(prior)}.`
          : "No comparison for this period.",
    ],
    [
      "Recovery",
      selectedRow?.recovery !== null && selectedRow?.recovery !== undefined
        ? `${selectedRow.recovery.toFixed(0)} (100 = 2019 level).`
        : `${LOW_VOLUME}: needs ${MIN_BASE}+ issuances in 2019.`,
    ],
  ];

  const countrySlug = (scopeCountry ?? "all").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const postSlug = (selectedPost ?? "none").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const sourceValidation = data.meta.validation.postsMonthly;

  // Extra columns for the table CSV (kept from the old comparison table).
  const csvRows = () =>
    sorted.map((r) => {
      const rows = visaRows.filter(
        (x) => x.post === r.post && x.monthIndex >= periodRange.start && x.monthIndex <= periodRange.end,
      );
      const cv = volatilityIn(rows, periodRange);
      const postTypical = typicalYear(visaRows.filter((x) => x.post === r.post), typical.years);
      const base = sumBy(visaRows.filter((x) => x.post === r.post && x.year === 2019), (x) => x.issuances);
      return [
        r.post,
        r.country,
        String(r.volume),
        r.prior === null ? "" : String(r.prior),
        r.change === null ? "" : r.change.toFixed(1),
        r.share.toFixed(2),
        r.countryShare.toFixed(2),
        String(base),
        r.recovery === null ? "" : r.recovery.toFixed(1),
        volatilityLabel(cv),
        cv === null ? "" : cv.toFixed(3),
        postTypical.lowVolume ? LOW_VOLUME : seasonalityStrengthLabel(postTypical.seasonalityRatio),
      ];
    });

  // Visa restrictions for the country's nationals, or a pause at its consulates.
  const notes = scope === "country" ? consulateScopeNotes(focusCountry) : [];
  const restrictionNote =
    notes.length > 0 ? (
      <div className="space-y-1 rounded-md border border-amber-400/30 bg-amber-500/[0.08] px-3 py-2 text-sm text-amber-100">
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    ) : null;

  if (scope === "country" && !consulateCountries.has(focusCountry)) {
    return (
      <div className="space-y-6">
        <SectionTitle>Consulates</SectionTitle>
        <ScopeSwitch scope={scope} onChange={setScope} country={focusCountry} />
        {restrictionNote}
        <InfoCallout>
          No consulate data for {focusCountry} in this view: the monthly consulate data has no posts
          in this country. Switch to All countries to see every consulate.
        </InfoCallout>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle>Consulates</SectionTitle>
      <ScopeSwitch scope={scope} onChange={setScope} country={focusCountry} />
      {restrictionNote}

      {context && (
        <p className="text-sm text-slate-300">
          Consulates in {focusCountry} issued <b className="text-white">{int(context.issuedIn)}</b>{" "}
          {visaLabel} visas in {periodRange.inSentence}; nationals of {focusCountry} received{" "}
          <b className="text-white">{int(context.receivedBy)}</b> {visaLabel} visas worldwide.{" "}
          <span className="text-xs text-slate-400">
            These measure different things: where visas were issued vs who received them.
          </span>
        </p>
      )}

      {/* 1. Ranked consulates */}
      <section>
        <SubHeading>
          Consulates in {scopeName}, {visaLabel}, {periodRange.label}
        </SubHeading>
        <div className="mb-3 flex flex-wrap items-end gap-4">
          <div className="w-56">
            <Select
              label="Selected consulate"
              value={selectedPost ?? ""}
              options={posts}
              onChange={setChosenPost}
            />
          </div>
          <div className="w-44">
            <Select label="Sort by" value={sortBy} options={SORTS} onChange={(v) => setSortBy(v as Sort)} />
          </div>
        </div>
        <DataTable<ConsulateRow>
          rows={sorted}
          height={380}
          rowKey={(row) => row.post}
          onRowClick={(row) => setChosenPost(row.post)}
          isSelected={(row) => row.post === selectedPost}
          empty={`No ${visaLabel} consulate issuances in ${scopeName} for ${periodRange.label}.`}
          columns={[
            {
              key: "post",
              header: "Consulate",
              render: (r) => (
                <>
                  {r.post}
                  <PausedPostBadge post={r.post} compact />
                </>
              ),
            },
            ...(scope === "all"
              ? [{ key: "country", header: "Country", render: (r: ConsulateRow) => r.country }]
              : []),
            { key: "volume", header: periodRange.label, numeric: true, render: (r) => int(r.volume) },
            { key: "change", header: changeLabel, numeric: true, render: (r) => changeCell(r) },
            { key: "share", header: `Share of ${scopeName}`, numeric: true, render: (r) => `${r.share.toFixed(1)}%` },
            {
              key: "recovery",
              header: `${recoveryLabel} · 100 = 2019 level`,
              numeric: true,
              render: (r) => recoveryCell(r.recovery),
            },
          ]}
        />
        <p className="mt-2 text-xs text-slate-400">
          Click a row, or use the picker, to select a consulate. Total {int(scopeTotal)}. &quot;{LOW_VOLUME}&quot;
          means fewer than {MIN_BASE} issuances in the previous period (change) or in 2019 (recovery);
          &quot;—&quot; means no earlier period. {noPriorNote}
        </p>
        <DownloadCsvButton
          label="Download consulate table CSV"
          filename={`qu_consulates_${countrySlug}_${visa.toLowerCase()}_${periodRange.slug}.csv`}
          headers={[
            "Consulate", "Country", `Issuances ${periodRange.label}`,
            prior ? `Issuances ${monthRangeLabel(prior)}` : "Issuances previous period",
            "Change %", `Share of ${scopeName} %`, "Share of country %", "2019 total",
            `${recoveryLabel} (100 = 2019)`, "Volatility", "Volatility CV", "Seasonality strength",
          ]}
          rows={csvRows()}
        />
      </section>

      {/* 2. Trend */}
      <section>
        <SubHeading>Trend</SubHeading>
        <div className="mb-3 flex flex-wrap items-end gap-4">
          <TrendSwitch value={trendMode} onChange={setTrendMode} sameLabel={throughLabel} />
        </div>
        <div className="mb-3 max-w-3xl">
          <ComparePicker
            label="Consulates on the chart"
            noun="consulates"
            options={posts}
            value={compared}
            onChange={(next) => setCompareChoice({ key: scopeKey, posts: next })}
            presets={TOP_CHOICES.map((n) => ({
              label: `Top ${n} (${periodRange.label})`,
              values: posts.slice(0, n),
            }))}
            max={COMPARE_MAX}
          />
          <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="How many top consulates">
            {TOP_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={compareChoice?.key !== scopeKey && topN === n}
                onClick={() => {
                  setTopN(n);
                  setCompareChoice(null);
                }}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#FFB81C] ${
                  compareChoice?.key !== scopeKey && topN === n
                    ? "border-[#FFB81C] bg-[rgba(255,184,28,0.16)] text-[#ffdf87]"
                    : "border-slate-400/30 text-slate-300 hover:bg-white/5"
                }`}
              >
                Top {n}
              </button>
            ))}
          </div>
        </div>
        {compared.length > 0 ? (
          <>
            {eventsOn && (
              <div className="mb-1 flex justify-end">
                <EventsToggle />
              </div>
            )}
            <Chart data={trendChart.traces} layout={trendChart.layout} height={460} />
            {eventsOn && <EventsList overlay={trendEvents} />}
          </>
        ) : (
          <InfoCallout>Add a consulate or pick Top 3, 5 or 8 to draw the trend.</InfoCallout>
        )}
        <Caption>
          {trendMode === "monthly" &&
            "Method note: the State Department changed its publication format in October 2022; the measure is still monthly issuance by post and visa class."}
          {trendMode === "annual" &&
            partialYears.length > 0 &&
            `Partial years: ${partialYears.join(", ")}. They aren't comparable with full years.`}
          {trendMode === "same" &&
            throughLabel &&
            `Each year counts only ${throughLabel}, the months the latest year has so far, so every point compares like with like.`}
        </Caption>
      </section>

      {/* 3. Risers and fallers */}
      <section>
        <SubHeading>
          Risers and fallers
          <FixedTag title="Ignores the Period and Visa controls; follows the Scope switch.">
            Always last 12 months · F1
          </FixedTag>
        </SubHeading>
        <div className="grid gap-4 lg:grid-cols-2">
          {movers.risers.count > 0 ? (
            <Chart data={movers.risers.data} layout={movers.risers.layout} height={movers.risers.layout.height as number} />
          ) : (
            <InfoCallout>No qualifying consulate in {scopeName} grew.</InfoCallout>
          )}
          {movers.fallers.count > 0 ? (
            <Chart data={movers.fallers.data} layout={movers.fallers.layout} height={movers.fallers.layout.height as number} />
          ) : (
            <InfoCallout>No qualifying consulate in {scopeName} declined.</InfoCallout>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          F1 issuances, {movers.period} vs the previous 12 months, consulates in {scopeName}. Only
          consulates with at least {MOVER_MIN_ISSUANCES} F1 issuances in both 12-month periods are
          included ({movers.qualifying}).
        </p>
      </section>

      {/* 4. Typical-year heatmap */}
      <section>
        <SubHeading>
          Seasonality
          <FixedTag title="Ignores the Period control.">Typical year: {typical.label}</FixedTag>
        </SubHeading>
        {heatmapPosts.length > 0 ? (
          <Chart data={heatmap.data} layout={heatmap.layout} height={heatmap.layout.height as number} />
        ) : (
          <InfoCallout>No consulates to show.</InfoCallout>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Average {visaLabel} issuances per month over complete years except 2020–2021 (COVID).{" "}
          {scope === "all"
            ? `Top ${topN} consulates by ${periodRange.label} volume.`
            : `All consulates in ${focusCountry}.`}
        </p>
      </section>

      {/* 5. Consulate detail */}
      {selectedRow && (
        <section>
          <SubHeading>Consulate detail: {selectedRow.post}</SubHeading>
          {pausedPostText(selectedRow.post) && (
            <div className="mb-3">
              <PausedPostBadge post={selectedRow.post} />
            </div>
          )}
          <KpiRow>
            <KpiCard accent="gold" label={`${visaLabel}, ${periodRange.label}`} value={int(selectedRow.volume)} />
            <KpiCard label={changeLabel} value={changeCell(selectedRow)} delta={noPriorNote ?? undefined} />
            <KpiCard
              label={`Share of ${selectedRow.country}, ${periodRange.label}`}
              value={`${selectedRow.countryShare.toFixed(1)}%`}
            />
            <KpiCard
              accent="navy"
              label={recoveryLabel}
              value={recoveryCell(selectedRow.recovery)}
              delta="100 = 2019 level"
            />
            <KpiCard label="Peak month (typical year)" value={peakName} valueClassName="!text-[18px]" />
          </KpiRow>

          <Expander title="More details">
            <KpiRow>
              <KpiCard
                label={`Latest month (${monthDisplay(latestIndex)})`}
                value={metricNumber(latestMonthTotal)}
              />
              <KpiCard label={`Average per month, ${periodRange.label}`} value={perMonthText(averageMonthly)} />
              <KpiCard label={`Months with issuances, ${periodRange.label}`} value={metricNumber(monthsWithIssuances)} />
              <KpiCard label="Volatility" value={periodVolatility} valueClassName="!text-[16px]" />
            </KpiRow>
            <Panel accent="navy">
              <h4 className="mb-2 text-base font-bold text-[#93C5FD]">Summary</h4>
              <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-[#DDEBFA]">
                {insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Panel>
            <Chart data={splitChart.traces} layout={splitChart.layout} height={360} />
            {recoveryChart.traces.length > 0 ? (
              <Chart data={recoveryChart.traces} layout={recoveryChart.layout} height={340} />
            ) : (
              <InfoCallout>
                Recovery index not available: needs at least {MOVER_MIN_ISSUANCES} issuances in 2019.
              </InfoCallout>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {admissionsCards.map(([title, body]) => (
                <div key={title} className="rounded-md border border-slate-400/15 bg-white/[0.03] p-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#93a4ba]">{title}</div>
                  <div className="mt-1 text-[13px] leading-snug text-white">{body}</div>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Visa issuance volume is a directional student-mobility and consular-workload signal. It
              does not measure Quinnipiac applications, admits, deposits, enrollments, or individual
              visa approval probability.
            </p>
            <DataTable
              rows={selectedPeriodRows.slice(0, 1000)}
              height={300}
              rowKey={(row, index) => `${row.monthIndex}-${row.visa}-${index}`}
              columns={[
                { key: "month", header: "Month", render: (r) => `${r.year}-${String(r.month).padStart(2, "0")}` },
                { key: "visa", header: "Visa", render: (r) => r.visa },
                { key: "issuances", header: "Issuances", numeric: true, render: (r) => int(r.issuances) },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <DownloadCsvButton
                label="Download source rows CSV"
                filename={`qu_consulate_rows_${postSlug}_${visa.toLowerCase()}_${periodRange.slug}.csv`}
                headers={["Month", "Country", "Post", "Visa Class", "Issuances"]}
                rows={selectedPeriodRows.map((r) => [
                  `${r.year}-${String(r.month).padStart(2, "0")}`,
                  r.country, r.post, r.visa, String(r.issuances),
                ])}
              />
              <DownloadCsvButton
                label="Download consulate summary CSV"
                filename={`qu_consulate_summary_${postSlug}_${visa.toLowerCase()}_${periodRange.slug}.csv`}
                headers={[
                  "post", "country", "issuances", "previous_period", "change_pct", "share_of_country_pct",
                  "recovery_vs_2019", "peak_month_typical_year", "volatility",
                ]}
                rows={[[
                  selectedRow.post,
                  selectedRow.country,
                  String(selectedRow.volume),
                  selectedRow.prior === null ? "" : String(selectedRow.prior),
                  selectedRow.change === null ? "" : selectedRow.change.toFixed(1),
                  selectedRow.countryShare.toFixed(2),
                  selectedRow.recovery === null ? "" : selectedRow.recovery.toFixed(1),
                  peakName,
                  periodVolatility,
                ]]}
              />
            </div>
          </Expander>
        </section>
      )}

      <Expander title="Data source and validation">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Source: U.S. Department of State monthly NIV issuance reports, by post.</li>
          <li>Coverage: {monthLongDisplay(coverage.start)} – {monthLongDisplay(coverage.end)}.</li>
          <li>
            Rows: {int(sourceValidation.rows)} across {int(sourceValidation.posts)} posts in{" "}
            {int(sourceValidation.countries)} countries; missing months: {sourceValidation.missingMonths.length}.
          </li>
          <li>F1 total {int(sourceValidation.f1)}; J1 total {int(sourceValidation.j1)}.</li>
          <li>
            Snapshot built {new Date(data.meta.generatedAt).toLocaleString()} from{" "}
            {data.meta.sources.map((s) => s.file).join(", ")}.
          </li>
        </ul>
      </Expander>
    </div>
  );
}

/** "—" with no previous period; "— (low volume)" when the previous period had fewer than 100. */
const changeCell = (row: { change: number | null; prior: number | null }) =>
  row.prior === null ? "—" : row.change === null ? LOW_VOLUME : arrowPct(row.change);

/** "This country / All countries" switch: a radio group, arrow keys to move. */
function ScopeSwitch({
  scope,
  onChange,
  country,
}: {
  scope: Scope;
  onChange: (scope: Scope) => void;
  country: string;
}) {
  const options: Array<[Scope, string]> = [
    ["country", `This country: ${country}`],
    ["all", "All countries"],
  ];
  return (
    <div role="radiogroup" aria-label="Scope" className="inline-flex rounded-md border border-slate-400/25 bg-[#07152E] p-0.5">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={scope === value}
          tabIndex={scope === value ? 0 : -1}
          onClick={() => onChange(value)}
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              onChange(scope === "country" ? "all" : "country");
            }
          }}
          className={`rounded px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#FFB81C] ${
            scope === value ? "bg-[#FFB81C] text-[#0C2340]" : "text-slate-300 hover:bg-white/5"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Monthly / Annual / Same months each year. */
function TrendSwitch({
  value,
  onChange,
  sameLabel,
}: {
  value: TrendMode;
  onChange: (mode: TrendMode) => void;
  sameLabel: string | null;
}) {
  const options: Array<[TrendMode, string]> = [
    ["monthly", "Monthly"],
    ["annual", "Annual (calendar years)"],
    ...(sameLabel ? ([["same", `Same months each year (${sameLabel})`]] as Array<[TrendMode, string]>) : []),
  ];
  return (
    <div role="radiogroup" aria-label="Trend view" className="inline-flex flex-wrap rounded-md border border-slate-400/25 bg-[#07152E] p-0.5">
      {options.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          onClick={() => onChange(mode)}
          className={`rounded px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#FFB81C] ${
            value === mode ? "bg-[#FFB81C] text-[#0C2340]" : "text-slate-300 hover:bg-white/5"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

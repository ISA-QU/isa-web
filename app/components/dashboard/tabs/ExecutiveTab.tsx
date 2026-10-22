"use client";

import { useMemo } from "react";
import type { ChartFrame, ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES_FULL } from "../../../lib/dashboard/constants";
import { calendarYearLabel } from "../../../lib/dashboard/periods";
import { int } from "../../../lib/dashboard/format";
import { groupSum, idxMaxNumeric, idxMaxString } from "../../../lib/dashboard/metrics";
import {
  arrowPct,
  monthRangeLabel,
  rollingTotals,
  type RollingGroup,
} from "../../../lib/dashboard/rolling";
import type { CountrySummaryRow } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import { FixedTag, Panel } from "../ui";

const BLUE_GOLD_SCALE: Array<[number, string]> = [
  [0, "#0D3B7A"],
  [0.5, "#3D8DDE"],
  [1, "#FFB81C"],
];

const peakLabel = (peakMonth: number): string =>
  peakMonth ? (MONTH_NAMES_FULL[peakMonth] ?? "N/A") : "N/A";

/** `country_card_html` — the focus-market card beside the globe. */
function CountryCard({
  row,
  f1,
  j1,
  period,
}: {
  row: CountrySummaryRow;
  f1: RollingGroup | undefined;
  j1: RollingGroup | undefined;
  period: string;
}) {
  const stats: Array<[string, string]> = [
    ["F1, last 12 months", int(f1?.current ?? 0)],
    ["J1, last 12 months", int(j1?.current ?? 0)],
    ["F1 vs previous 12 months", arrowPct(f1?.change ?? null)],
    ["Top Consulate", row.topPost],
    ["Peak Visa Month", peakLabel(row.peakMonth)],
  ];

  return (
    <Panel accent="gold" className="h-full">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FFB81C]">
        Focus Market
      </div>
      <div className="mt-1 text-2xl font-extrabold text-white">{row.country}</div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Hover over the globe for the same country-level intelligence in context.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Last 12 months = {period}, by the country where the visa was issued.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-400/15 bg-white/[0.03] p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-[#93a4ba]">
              {label}
            </dt>
            <dd className="mt-1 text-sm font-bold text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export default function ExecutiveTab() {
  const {
    data,
    summary,
    focusCountry,
    consulateCountries,
    visaFiltered,
    dfFiltered,
    visaLabel,
    periodRange,
  } = useDashboard();

  /* ---- Latest 12 months vs the 12 before, by issuing country (ignores the Years filter) ---- */
  const end = data.meta.coverage.postsMonthly.end;
  const last12 = useMemo(() => {
    const f1 = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "F1" ? r.country : null));
    const j1 = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "J1" ? r.country : null));
    return { f1: f1.groups, j1: j1.groups, period: monthRangeLabel(f1.current) };
  }, [data.postsMonthly, end]);
  const operationalPeriod = monthRangeLabel(data.meta.coverage.operational);

  // No fallback to another country: a country without rows gets a message instead.
  const focusRow = summary.find((row) => row.country === focusCountry) ?? null;
  const focusMissingText = consulateCountries.has(focusCountry)
    ? `No consulate data for ${focusCountry} in ${operationalPeriod}.`
    : `No consulate data for ${focusCountry} in this view.`;

  /* ---- Globe: choropleth by country name, with orthographic rotation ---- */
  // Totals, top consulate and peak month follow the control bar's Period; the
  // change line is always the last 12 months.
  const globeRows = useMemo(() => {
    const byCountry = new Map<
      string,
      { f1: number; j1: number; posts: Map<string, number>; months: Map<number, number> }
    >();
    for (const row of dfFiltered) {
      let entry = byCountry.get(row.country);
      if (!entry) {
        entry = { f1: 0, j1: 0, posts: new Map(), months: new Map() };
        byCountry.set(row.country, entry);
      }
      if (row.visa === "J1") {
        entry.j1 += row.issuances;
        continue;
      }
      entry.f1 += row.issuances;
      entry.posts.set(row.post, (entry.posts.get(row.post) ?? 0) + row.issuances);
      entry.months.set(row.month, (entry.months.get(row.month) ?? 0) + row.issuances);
    }
    return [...byCountry.entries()]
      .filter(([, e]) => e.f1 > 0)
      .map(([country, e]) => ({
        country,
        f1: e.f1,
        j1: e.j1,
        topPost: idxMaxString(e.posts) ?? "N/A",
        peakMonth: idxMaxNumeric(e.months) ?? 0,
      }))
      .sort((a, b) => b.f1 - a.f1);
  }, [dfFiltered]);

  const globe = useMemo(() => {
    const colorTitle = `F1 Issuances, ${periodRange.label}`;
    const z = globeRows.map((row) => row.f1);

    const data: Trace[] = [
      {
        type: "choropleth",
        locations: globeRows.map((row) => row.country),
        locationmode: "country names",
        z,
        text: globeRows.map((row) => row.country),
        customdata: globeRows.map((row) => [
          int(row.f1),
          int(row.j1),
          arrowPct(last12.f1.get(row.country)?.change ?? null),
          row.topPost,
          peakLabel(row.peakMonth),
        ]),
        colorscale: BLUE_GOLD_SCALE,
        marker: { line: { color: "rgba(255,255,255,0.24)", width: 0.45 } },
        colorbar: {
          title: { text: colorTitle, font: { color: "#FFFFFF", size: 12 } },
          tickfont: { color: "#DDEBFA", size: 11 },
          thickness: 12,
          len: 0.72,
        },
        hovertemplate:
          "<b>%{text}</b><br>" +
          `F1, ${periodRange.label}: %{customdata[0]}<br>` +
          `J1, ${periodRange.label}: %{customdata[1]}<br>` +
          `F1 vs previous 12 months (${last12.period}): %{customdata[2]}<br>` +
          `Top consulate (F1, ${periodRange.label}): %{customdata[3]}<br>` +
          `Peak F1 month (${periodRange.label}): %{customdata[4]}` +
          "<extra></extra>",
      } as Trace,
    ];

    const layout: ChartLayout = {
      height: 540,
      title: { text: "Interactive Global Recruitment Globe - Colored by F1 Issuances" },
      margin: { l: 0, r: 0, t: 58, b: 0 },
      geo: {
        projection: { type: "orthographic", rotation: { lon: -70, lat: 22, roll: 0 } },
        showframe: false,
        showcoastlines: true,
        coastlinecolor: "rgba(221,235,250,0.32)",
        showcountries: true,
        countrycolor: "rgba(221,235,250,0.18)",
        showland: true,
        landcolor: "rgba(13, 43, 85, 0.36)",
        showocean: true,
        oceancolor: "rgba(2, 8, 23, 0.98)",
        showlakes: false,
        bgcolor: "rgba(0,0,0,0)",
      },
      updatemenus: [
        {
          type: "buttons",
          direction: "left",
          x: 0.01,
          y: 0.03,
          xanchor: "left",
          yanchor: "bottom",
          bgcolor: "rgba(7, 21, 46, 0.8)",
          bordercolor: "rgba(255, 184, 28, 0.28)",
          font: { color: "#FFFFFF", size: 11 },
          // Plotly paints the "active" button light grey, which hid the white
          // "Rotate" label. No active highlight keeps both labels readable.
          showactive: false,
          active: -1,
          buttons: [
            {
              label: "Rotate",
              method: "animate",
              args: [
                null,
                {
                  frame: { duration: 90, redraw: true },
                  fromcurrent: true,
                  transition: { duration: 0 },
                  mode: "immediate",
                },
              ],
            },
            {
              label: "Pause",
              method: "animate",
              args: [[null], { frame: { duration: 0, redraw: false }, mode: "immediate" }],
            },
          ],
        },
      ],
    } as ChartLayout;

    const frames: ChartFrame[] = [];
    for (let lon = -180; lon <= 180; lon += 12) {
      frames.push({
        name: String(lon),
        layout: { geo: { projection: { rotation: { lon, lat: 22, roll: 0 } } } },
      } as ChartFrame);
    }

    return { data, layout, frames };
  }, [globeRows, last12, periodRange.label]);

  /* ---- Country rollup for the treemap (control bar's visa) ---- */
  const countryRollup = useMemo(() => {
    const totals = groupSum(visaFiltered, (r) => r.country, (r) => r.issuances);
    return [...totals.entries()]
      .map(([country, issuances]) => ({ country, issuances }))
      .sort((a, b) => b.issuances - a.issuances);
  }, [visaFiltered]);

  /* ---- Annual F1 vs J1: always every calendar year, whatever the Period ---- */
  // The first and last years are usually partial (e.g. "2017 (Mar–Dec)",
  // "2026 (Jan–Feb)"): labelled and drawn lighter and hatched so they aren't
  // read as full years. Labels come from the data's coverage.
  const coverage = data.meta.coverage.postsMonthly;
  const partialYearLabels = useMemo(() => {
    const labels: string[] = [];
    for (let year = Math.floor(coverage.start / 12); year <= Math.floor(coverage.end / 12); year += 1) {
      const label = calendarYearLabel(year, coverage);
      if (label !== String(year)) labels.push(label);
    }
    return labels;
  }, [coverage]);
  const annual = useMemo(() => {
    const yearLabel = (year: number) => calendarYearLabel(year, coverage);
    const bars = (rows: readonly { year: number; issuances: number }[], name: string, color: string): Trace => {
      const totals = [...groupSum(rows, (r) => r.year, (r) => r.issuances).entries()].sort(
        (a, b) => a[0] - b[0],
      );
      const partial = totals.map(([year]) => yearLabel(year) !== String(year));
      return {
        type: "bar",
        name,
        x: totals.map(([year]) => yearLabel(year)),
        y: totals.map(([, value]) => value),
        marker: {
          color,
          opacity: partial.map((p) => (p ? 0.45 : 1)),
          pattern: { shape: partial.map((p) => (p ? "/" : "")), fgcolor: "#FFFFFF", solidity: 0.25 },
        },
        hovertemplate: `<b>%{x}</b><br>${name}: %{y:,.0f}<extra></extra>`,
      };
    };
    const all = data.postsMonthly;
    const traces: Trace[] = [
      bars(all.filter((r) => r.visa === "F1"), "F1", "#FFB81C"),
      bars(all.filter((r) => r.visa === "J1"), "J1", "#3D8DDE"),
    ];
    const layout: ChartLayout = {
      barmode: "group",
      height: 380,
      title: { text: "Annual F1 vs J1 Issuances (calendar years)" },
      xaxis: { type: "category" },
    };
    return { data: traces, layout };
  }, [data.postsMonthly, coverage]);

  /* ---- Top 20 treemap ---- */
  const treemap = useMemo(() => {
    const top = countryRollup.slice(0, 20);
    const data: Trace[] = [
      {
        type: "treemap",
        labels: top.map((r) => r.country),
        parents: top.map(() => ""),
        values: top.map((r) => r.issuances),
        marker: {
          colors: top.map((r) => r.issuances),
          colorscale: BLUE_GOLD_SCALE,
          showscale: false,
        },
        textinfo: "label+value",
        hovertemplate: `<b>%{label}</b><br>${visaLabel} Issuances: %{value:,.0f}<extra></extra>`,
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 380,
      title: { text: `Top 20 ${visaLabel} Markets, ${periodRange.label}` },
      margin: { l: 0, r: 0, t: 50, b: 0 },
    };
    return { data, layout };
  }, [countryRollup, visaLabel, periodRange.label]);

  /* ---- Monthly trend: one continuous line across the Period ---- */
  const monthlyTrend = useMemo(() => {
    const byMonth = groupSum(visaFiltered, (r) => r.year * 12 + (r.month - 1), (r) => r.issuances);
    const months = [...byMonth.keys()].sort((a, b) => a - b);
    const data: Trace[] = [
      {
        type: "scatter",
        mode: "lines+markers",
        name: visaLabel,
        x: months.map((index) => monthRangeLabel({ start: index, end: index })),
        y: months.map((index) => byMonth.get(index)!),
        line: { color: "#FFB81C", width: 3 },
        marker: { color: "#FFB81C", size: 6 },
        hovertemplate: `<b>%{x}</b><br>${visaLabel}: %{y:,.0f}<extra></extra>`,
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 380,
      title: { text: `Global Monthly ${visaLabel} Issuances, ${periodRange.label}` },
      xaxis: { tickangle: -45, type: "category" },
      showlegend: false,
    };
    return { data, layout };
  }, [visaFiltered, visaLabel, periodRange.label]);

  if (summary.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[rgba(61,141,222,0.24)] bg-[radial-gradient(circle_at_72%_32%,rgba(61,141,222,0.18),transparent_22rem),linear-gradient(180deg,rgba(6,24,52,0.92),rgba(3,12,28,0.9))] p-[22px]">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#ffdf87]">
          Visual Intelligence Layer
          <FixedTag title="The globe's totals follow the Period; its change line and the focus card always use the last 12 months.">
            Change line and focus card: always last 12 months
          </FixedTag>
        </div>
        <div className="mt-1 text-xl font-extrabold text-white">
          Interactive Global Recruitment Globe
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
          Drag to rotate the orthographic globe, use Rotate/Pause for motion, and hover countries for
          F1/J1 totals, top consulate and peak month in {periodRange.inSentence}, plus the F1 change
          vs the previous 12 months.
          Country means where the visa was issued. This layer is visual
          only and does not control dashboard filters.
        </p>
      </div>


      <div className="grid gap-4 lg:grid-cols-[2.4fr_1fr]">
        <Chart
          data={globe.data}
          layout={globe.layout}
          frames={globe.frames}
          height={540}
          ariaLabel="Interactive global recruitment globe"
        />
        {focusRow ? (
          <CountryCard
            row={focusRow}
            f1={last12.f1.get(focusRow.country)}
            j1={last12.j1.get(focusRow.country)}
            period={last12.period}
          />
        ) : (
          <Panel accent="gold" className="h-full">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FFB81C]">
              Focus Market
            </div>
            <div className="mt-1 text-2xl font-extrabold text-white">{focusCountry}</div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{focusMissingText}</p>
          </Panel>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Chart data={annual.data} layout={annual.layout} height={380} />
          <p className="mt-2 text-xs text-slate-400">
            <FixedTag title="This chart ignores the Period control.">All calendar years</FixedTag>{" "}
            Calendar years by issuing consulate, {monthRangeLabel(coverage)}.
            {partialYearLabels.length > 0 &&
              ` Partial years (${partialYearLabels.join(", ")}) aren't comparable with full years.`}
          </p>
        </div>
        <Chart data={treemap.data} layout={treemap.layout} height={380} />
      </div>

      <Chart data={monthlyTrend.data} layout={monthlyTrend.layout} height={380} />
    </div>
  );
}

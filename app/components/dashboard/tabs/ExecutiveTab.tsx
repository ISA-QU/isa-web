"use client";

import { useMemo } from "react";
import type { ChartFrame, ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES_FULL } from "../../../lib/dashboard/constants";
import { int } from "../../../lib/dashboard/format";
import { groupSum } from "../../../lib/dashboard/metrics";
import {
  arrowPct,
  monthRangeLabel,
  rollingTotals,
  type RollingGroup,
} from "../../../lib/dashboard/rolling";
import type { CountrySummaryRow } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import { Panel } from "../ui";

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
  const { data, summary, focusCountry, f1Filtered, j1Filtered } = useDashboard();

  /* ---- Latest 12 months vs the 12 before, by issuing country (ignores the Years filter) ---- */
  const end = data.meta.coverage.postsMonthly.end;
  const last12 = useMemo(() => {
    const f1 = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "F1" ? r.country : null));
    const j1 = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "J1" ? r.country : null));
    return { f1: f1.groups, j1: j1.groups, period: monthRangeLabel(f1.current) };
  }, [data.postsMonthly, end]);
  const operationalPeriod = monthRangeLabel(data.meta.coverage.operational);

  const focusRow =
    summary.find((row) => row.country === focusCountry) ?? summary[0] ?? null;

  /* ---- Globe: choropleth by country name, with orthographic rotation ---- */
  const globe = useMemo(() => {
    const colorTitle = `F1 Issuances, ${operationalPeriod}`;
    const z = summary.map((row) => row.f1Total);

    const data: Trace[] = [
      {
        type: "choropleth",
        locations: summary.map((row) => row.country),
        locationmode: "country names",
        z,
        text: summary.map((row) => row.country),
        customdata: summary.map((row) => [
          int(row.f1Total),
          int(row.j1Total),
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
          `F1 Total, ${operationalPeriod}: %{customdata[0]}<br>` +
          `J1 Total, ${operationalPeriod}: %{customdata[1]}<br>` +
          `F1 vs previous 12 months (${last12.period}): %{customdata[2]}<br>` +
          "Top Consulate/Post: %{customdata[3]}<br>" +
          "Peak Visa Month: %{customdata[4]}" +
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
  }, [summary, last12, operationalPeriod]);

  /* ---- Country rollup for the treemap ---- */
  const countryRollup = useMemo(() => {
    const totals = groupSum(f1Filtered, (r) => r.country, (r) => r.issuances);
    return [...totals.entries()]
      .map(([country, issuances]) => ({ country, issuances }))
      .sort((a, b) => b.issuances - a.issuances);
  }, [f1Filtered]);

  /* ---- Annual F1 vs J1 ---- */
  const annual = useMemo(() => {
    const f1Annual = [...groupSum(f1Filtered, (r) => r.year, (r) => r.issuances).entries()].sort(
      (a, b) => a[0] - b[0],
    );
    const j1Annual = [...groupSum(j1Filtered, (r) => r.year, (r) => r.issuances).entries()].sort(
      (a, b) => a[0] - b[0],
    );
    const data: Trace[] = [
      {
        type: "bar",
        name: "F1",
        x: f1Annual.map(([year]) => year),
        y: f1Annual.map(([, value]) => value),
        marker: { color: "#FFB81C" },
      },
      {
        type: "bar",
        name: "J1",
        x: j1Annual.map(([year]) => year),
        y: j1Annual.map(([, value]) => value),
        marker: { color: "#3D8DDE" },
      },
    ];
    const layout: ChartLayout = {
      barmode: "group",
      height: 380,
      title: { text: "Annual F1 vs J1 Issuances" },
    };
    return { data, layout };
  }, [f1Filtered, j1Filtered]);

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
        hovertemplate: "<b>%{label}</b><br>F1 Issuances: %{value:,.0f}<extra></extra>",
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 380,
      title: { text: "Top 20 F1 Markets" },
      margin: { l: 0, r: 0, t: 50, b: 0 },
    };
    return { data, layout };
  }, [countryRollup]);

  /* ---- Monthly trend, one line per year ---- */
  const monthlyTrend = useMemo(() => {
    const palette = ["#3D8DDE", "#FFB81C", "#86EFAC"];
    const years = [...new Set(f1Filtered.map((r) => r.year))].sort((a, b) => a - b);
    const byYearMonth = groupSum(
      f1Filtered,
      (r) => `${r.year}-${String(r.month).padStart(2, "0")}`,
      (r) => r.issuances,
    );
    const periods = [...byYearMonth.keys()].sort();

    const data: Trace[] = years.map((year, index) => {
      const yearPeriods = periods.filter((period) => period.startsWith(`${year}-`));
      return {
        type: "scatter",
        mode: "lines+markers",
        name: String(year),
        x: yearPeriods,
        y: yearPeriods.map((period) => byYearMonth.get(period)!),
        line: { shape: "spline", color: palette[index % palette.length] },
        marker: { color: palette[index % palette.length] },
      } as Trace;
    });

    const layout: ChartLayout = {
      height: 380,
      title: { text: "Global Monthly F1 Issuance Trend by Year" },
      xaxis: { tickangle: -45, categoryorder: "category ascending" },
      hovermode: "x unified",
    };
    return { data, layout };
  }, [f1Filtered]);

  if (!focusRow) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[rgba(61,141,222,0.24)] bg-[radial-gradient(circle_at_72%_32%,rgba(61,141,222,0.18),transparent_22rem),linear-gradient(180deg,rgba(6,24,52,0.92),rgba(3,12,28,0.9))] p-[22px]">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#ffdf87]">
          Visual Intelligence Layer
        </div>
        <div className="mt-1 text-xl font-extrabold text-white">
          Interactive Global Recruitment Globe
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
          Drag to rotate the orthographic globe, use Rotate/Pause for motion, and hover countries for
          F1/J1 totals, the F1 change vs the previous 12 months, top consulate, and peak month.
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
        <CountryCard
          row={focusRow}
          f1={last12.f1.get(focusRow.country)}
          j1={last12.j1.get(focusRow.country)}
          period={last12.period}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart data={annual.data} layout={annual.layout} height={380} />
        <Chart data={treemap.data} layout={treemap.layout} height={380} />
      </div>

      <Chart data={monthlyTrend.data} layout={monthlyTrend.layout} height={380} />
    </div>
  );
}

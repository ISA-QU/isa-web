"use client";

import { useMemo } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES, MONTH_NAMES_FULL } from "../../../lib/dashboard/constants";
import { decimals, int, metricPct, monthDisplay } from "../../../lib/dashboard/format";
import { groupSum } from "../../../lib/dashboard/metrics";
import { arrowPct, monthRangeLabel, rollingTotals } from "../../../lib/dashboard/rolling";
import type { CountrySummaryRow } from "../../../lib/dashboard/types";

/** A rankings row: the country summary plus its latest-12-month figures. */
interface RankingRow extends CountrySummaryRow {
  f1Last12: number;
  j1Last12: number;
  f1Change: number | null;
}
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import { SubHeading } from "../shared";
import { DataTable, Divider, KpiCard, KpiRow, ScopeNote, SectionTitle } from "../ui";

const BLUE_GOLD: Array<[number, string]> = [
  [0, "#0D3B7A"],
  [0.5, "#3D8DDE"],
  [1, "#FFB81C"],
];

/**
 * The "Country Intelligence" tab. (app.py showed it under a "Consulates" label;
 * the label now matches the content.)
 */
export default function ConsulatesTab() {
  const {
    focusCountry,
    focus,
    summary,
    f1Filtered,
    dfFiltered,
    compareCountries,
    data,
    selectedYears,
    allYears,
  } = useDashboard();

  /* ---- Latest 12 months vs the 12 before, by issuing country (ignores the Years filter) ---- */
  const end = data.meta.coverage.postsMonthly.end;
  const last12 = useMemo(() => {
    const f1 = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "F1" ? r.country : null));
    const j1 = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "J1" ? r.country : null));
    return { f1: f1.groups, j1: j1.groups, current: f1.current, prior: f1.prior };
  }, [data.postsMonthly, end]);
  const period = monthRangeLabel(last12.current);
  const priorPeriod = monthRangeLabel(last12.prior);

  // The years Active Posts and Seasonality CV cover; an empty selection means all years.
  const filterYears = [...(selectedYears.length > 0 ? selectedYears : allYears)].sort((a, b) => a - b);
  const endYear = Math.floor(end / 12);
  const endMonth = (end % 12) + 1;
  const filterYearsText =
    filterYears
      .map((year) => (year === endYear && endMonth < 12 ? `${year} (Jan–${MONTH_NAMES[endMonth]})` : String(year)))
      .join(", ") || "none";

  const focusF1 = last12.f1.get(focusCountry);
  const focusJ1 = last12.j1.get(focusCountry);
  const focusChange = focusF1?.change ?? null;

  const rankings = useMemo<RankingRow[]>(
    () =>
      summary
        .map((row) => {
          const f1 = last12.f1.get(row.country);
          return {
            ...row,
            f1Last12: f1?.current ?? 0,
            j1Last12: last12.j1.get(row.country)?.current ?? 0,
            f1Change: f1?.change ?? null,
          };
        })
        .sort((a, b) => b.f1Last12 - a.f1Last12 || a.country.localeCompare(b.country)),
    [summary, last12],
  );

  /* ---- Monthly F1 trend, stacked by year ---- */
  const trend = useMemo(() => {
    const palette = ["#3D8DDE", "#FFB81C", "#86EFAC"];
    const byPeriod = groupSum(
      focus.f1,
      (r) => `${r.year}-${String(r.month).padStart(2, "0")}`,
      (r) => r.issuances,
    );
    const years = [...new Set(focus.f1.map((r) => r.year))].sort((a, b) => a - b);
    const periods = [...byPeriod.keys()].sort();

    const data: Trace[] = years.map((year, index) => {
      const yearPeriods = periods.filter((period) => period.startsWith(`${year}-`));
      return {
        type: "scatter",
        mode: "lines+markers",
        name: String(year),
        x: yearPeriods,
        y: yearPeriods.map((period) => byPeriod.get(period)!),
        line: { shape: "spline", color: palette[index % palette.length] },
        marker: { color: palette[index % palette.length] },
        stackgroup: "one",
      } as Trace;
    });

    const layout: ChartLayout = {
      height: 420,
      title: { text: `Monthly F1 Trend - ${focusCountry}` },
      hovermode: "x unified",
      xaxis: { tickangle: -45, categoryorder: "category ascending" },
    };
    return { data, layout };
  }, [focus.f1, focusCountry]);

  /* ---- Top 10 consulates ---- */
  const topPosts = useMemo(() => {
    const rows = [...groupSum(focus.f1, (r) => r.post, (r) => r.issuances).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const data: Trace[] = [
      {
        type: "bar",
        orientation: "h",
        x: rows.map(([, value]) => value),
        y: rows.map(([post]) => post),
        text: rows.map(([, value]) => int(value)),
        textposition: "auto",
        marker: { color: rows.map(([, value]) => value), colorscale: BLUE_GOLD },
        hovertemplate: "<b>%{y}</b><br>F1 Issuances: %{x:,.0f}<extra></extra>",
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 420,
      title: { text: "Top F1 Consulates" },
      yaxis: { autorange: "reversed" },
    };
    return { data, layout };
  }, [focus.f1]);

  /* ---- Seasonality by calendar month ---- */
  const seasonality = useMemo(() => {
    const totals = groupSum(focus.f1, (r) => r.month, (r) => r.issuances);
    const months = [...totals.keys()].sort((a, b) => a - b);
    const data: Trace[] = [
      {
        type: "bar",
        x: months.map((month) => MONTH_NAMES[month]),
        y: months.map((month) => totals.get(month)!),
        text: months.map((month) => int(totals.get(month)!)),
        textposition: "auto",
        marker: { color: months.map((month) => totals.get(month)!), colorscale: BLUE_GOLD },
        hovertemplate: "<b>%{x}</b><br>F1 Issuances: %{y:,.0f}<extra></extra>",
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 380,
      title: { text: `F1 Seasonality - ${focusCountry}` },
    };
    return { data, layout };
  }, [focus.f1, focusCountry]);

  /* ---- F1 vs J1 over time ---- */
  const bothVisas = useMemo(() => {
    const rows = dfFiltered.filter((r) => r.country === focusCountry);
    const byMonthVisa = groupSum(
      rows,
      (r) => `${r.year * 12 + (r.month - 1)}|${r.visa}`,
      (r) => r.issuances,
    );
    const colors: Record<string, string> = { F1: "#FFB81C", J1: "#3D8DDE" };
    const data: Trace[] = (["F1", "J1"] as const).map((visa) => {
      const points = [...byMonthVisa.entries()]
        .filter(([key]) => key.endsWith(`|${visa}`))
        .map(([key, value]) => ({ index: Number(key.split("|")[0]), value }))
        .sort((a, b) => a.index - b.index);
      return {
        type: "scatter",
        mode: "lines+markers",
        name: visa,
        x: points.map((p) => monthDisplay(p.index)),
        y: points.map((p) => p.value),
        line: { shape: "spline", color: colors[visa] },
        marker: { color: colors[visa] },
      } as Trace;
    });
    const layout: ChartLayout = {
      height: 380,
      title: { text: `F1 vs J1 Trends - ${focusCountry}` },
      hovermode: "x unified",
    };
    return { data, layout };
  }, [dfFiltered, focusCountry]);

  /* ---- Multi-country comparison ---- */
  const comparison = useMemo(() => {
    const rows = f1Filtered.filter((r) => compareCountries.includes(r.country));
    const byMonthCountry = groupSum(
      rows,
      (r) => `${r.year * 12 + (r.month - 1)}|${r.country}`,
      (r) => r.issuances,
    );
    const data: Trace[] = compareCountries.map((country) => {
      const points = [...byMonthCountry.entries()]
        .filter(([key]) => key.slice(key.indexOf("|") + 1) === country)
        .map(([key, value]) => ({ index: Number(key.split("|")[0]), value }))
        .sort((a, b) => a.index - b.index);
      return {
        type: "scatter",
        mode: "lines+markers",
        name: country,
        x: points.map((p) => monthDisplay(p.index)),
        y: points.map((p) => p.value),
        line: { shape: "spline" },
      } as Trace;
    });
    const layout: ChartLayout = {
      height: 420,
      title: { text: "F1 Issuance Comparison Over Time" },
      hovermode: "x unified",
    };
    return { data, layout };
  }, [f1Filtered, compareCountries]);

  return (
    <div className="space-y-6">
      <ScopeNote label="Legacy Operational View">
        This page preserves the original recent country analysis and sidebar-driven filters.
      </ScopeNote>

      <SectionTitle>
        Country Intelligence - <b>{focusCountry}</b>
      </SectionTitle>

      <KpiRow>
        <KpiCard
          label="F1 issuances, last 12 months"
          value={int(focusF1?.current ?? 0)}
          title={`F1 issued in ${focusCountry}, ${period}: ${int(focusF1?.current ?? 0)}`}
        />
        <KpiCard
          label="J1 issuances, last 12 months"
          value={int(focusJ1?.current ?? 0)}
          title={`J1 issued in ${focusCountry}, ${period}: ${int(focusJ1?.current ?? 0)}`}
        />
        <KpiCard label="Active Posts" value={focus.posts} />
        <KpiCard
          label="F1 vs previous 12 months"
          value={arrowPct(focusChange)}
          valueClassName={
            focusChange === null ? "" : focusChange > 0 ? "!text-[#4ade80]" : focusChange < 0 ? "!text-[#f87171]" : ""
          }
          title={[
            `F1 issued in ${focusCountry}, ${period}: ${int(focusF1?.current ?? 0)}`,
            `F1 issued in ${focusCountry}, ${priorPeriod}: ${int(focusF1?.prior ?? 0)}`,
            `Change: ${metricPct(focusChange)}`,
          ].join("\n")}
        />
        <KpiCard label="Seasonality CV" value={decimals(focus.cv, 2)} />
      </KpiRow>
      <p className="-mt-4 text-xs text-slate-400">
        F1 and J1 issuances and the F1 change cover the last 12 months ({period}, compared with{" "}
        {priorPeriod}), by the country where the visa was issued, and ignore the sidebar Years
        filter. Active Posts and Seasonality CV follow the Years filter: {filterYearsText}.
      </p>

      <Divider />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Chart data={trend.data} layout={trend.layout} height={420} />
        <Chart data={topPosts.data} layout={topPosts.layout} height={420} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart data={seasonality.data} layout={seasonality.layout} height={380} />
        <Chart data={bothVisas.data} layout={bothVisas.layout} height={380} />
      </div>

      {compareCountries.length > 0 && (
        <section>
          <SubHeading>Multi-Country Comparison</SubHeading>
          <Chart data={comparison.data} layout={comparison.layout} height={420} />
        </section>
      )}

      <section>
        <SubHeading>Full Country Rankings</SubHeading>
        <p className="mb-3 text-xs text-slate-400">
          Sorted by F1 issuances in the last 12 months ({period}). Top Post and Peak Month use{" "}
          {monthRangeLabel(data.meta.coverage.operational)}.
        </p>
        <DataTable<RankingRow>
          rows={rankings}
          height={420}
          rowKey={(row) => row.country}
          columns={[
            { key: "country", header: "Country", render: (r) => r.country },
            { key: "f1", header: "F1, last 12 months", numeric: true, render: (r) => int(r.f1Last12) },
            { key: "j1", header: "J1, last 12 months", numeric: true, render: (r) => int(r.j1Last12) },
            {
              key: "growth",
              header: "F1 vs previous 12 months",
              numeric: true,
              render: (r) => arrowPct(r.f1Change),
            },
            { key: "post", header: "Top Post", render: (r) => r.topPost },
            {
              key: "peak",
              header: "Peak Month",
              render: (r) => MONTH_NAMES_FULL[r.peakMonth] ?? "N/A",
            },
          ]}
        />
      </section>
    </div>
  );
}

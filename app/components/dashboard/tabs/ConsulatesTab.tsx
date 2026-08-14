"use client";

import { useMemo } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { GROWTH_LABEL, MONTH_NAMES, MONTH_NAMES_FULL } from "../../../lib/dashboard/constants";
import { decimals, int, metricPct, monthDisplay } from "../../../lib/dashboard/format";
import { groupSum } from "../../../lib/dashboard/metrics";
import type { CountrySummaryRow } from "../../../lib/dashboard/types";
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
 * app.py renders this "Country Intelligence" view under the tab labelled
 * "Consulates" — the label and content are mismatched in the original, and that
 * pairing is preserved here.
 */
export default function ConsulatesTab() {
  const { focusCountry, focus, summary, f1Filtered, dfFiltered, compareCountries } = useDashboard();

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
        <KpiCard label="F1 Issuances" value={int(focus.total)} />
        <KpiCard label="J1 Issuances" value={int(focus.j1Total)} />
        <KpiCard label="Active Posts" value={focus.posts} />
        <KpiCard label={GROWTH_LABEL} value={metricPct(focus.growth)} />
        <KpiCard label="Seasonality CV" value={decimals(focus.cv, 2)} />
        <KpiCard label="Opp. Score" value={`${focus.opportunity}/100`} />
      </KpiRow>

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
        <DataTable<CountrySummaryRow>
          rows={summary}
          height={420}
          rowKey={(row) => row.country}
          columns={[
            { key: "country", header: "Country", render: (r) => r.country },
            { key: "f1", header: "F1 Total", numeric: true, render: (r) => int(r.f1Total) },
            { key: "j1", header: "J1 Total", numeric: true, render: (r) => int(r.j1Total) },
            { key: "growth", header: GROWTH_LABEL, numeric: true, render: (r) => metricPct(r.growthPct) },
            { key: "tier", header: "Market Tier", render: (r) => r.tier },
            { key: "opp", header: "Opp. Score", numeric: true, render: (r) => r.opportunityScore },
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

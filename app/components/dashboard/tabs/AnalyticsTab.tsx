"use client";

import { useMemo } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { GROWTH_LABEL } from "../../../lib/dashboard/constants";
import { notNa } from "../../../lib/dashboard/metrics";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import { SubHeading } from "../shared";
import { ScopeNote, SectionTitle } from "../ui";

const BLUE_GOLD: Array<[number, string]> = [
  [0, "#0D3B7A"],
  [0.5, "#3D8DDE"],
  [1, "#FFB81C"],
];

const HEAT_SCALE: Array<[number, string]> = [
  [0, "#040F22"],
  [0.3, "#0D3B7A"],
  [0.7, "#3D8DDE"],
  [1, "#FFB81C"],
];

export default function AnalyticsTab() {
  const { summary, f1 } = useDashboard();

  /**
   * Bubble map. app.py drops rows missing lat/lon here as well as missing
   * growth, so countries absent from COUNTRY_COORDS never appear.
   */
  const bubble = useMemo(() => {
    const rows = summary.filter(
      (r) => notNa(r.growthPct) && r.lat !== null && r.lon !== null,
    );
    const data: Trace[] = [
      {
        type: "scatter",
        mode: "markers+text",
        x: rows.map((r) => r.growthPct),
        y: rows.map((r) => r.f1Total),
        text: rows.map((r) => r.country),
        textposition: "top center",
        textfont: { size: 9 },
        marker: {
          size: rows.map((r) => r.opportunityScore),
          sizemode: "area",
          sizeref:
            rows.length > 0
              ? (2 * Math.max(...rows.map((r) => r.opportunityScore))) / 55 ** 2
              : 1,
          sizemin: 4,
          color: rows.map((r) => r.opportunityScore),
          colorscale: BLUE_GOLD,
          showscale: true,
          colorbar: { title: { text: "Opportunity Score" } },
        },
        hovertemplate:
          `<b>%{text}</b><br>${GROWTH_LABEL}: %{x:.1f}%<br>` +
          "Total F1 Issuances: %{y:,.0f}<extra></extra>",
      },
    ];
    const layout: ChartLayout = {
      height: 560,
      title: { text: `Opportunity Score Map: ${GROWTH_LABEL} vs Volume` },
      xaxis: { title: { text: GROWTH_LABEL } },
      yaxis: { title: { text: "Total F1 Issuances" } },
    };
    return { data, layout, plotted: rows.length, total: summary.length };
  }, [summary]);

  /** Annual matrix for the top 30 countries by F1 volume. */
  const matrix = useMemo(() => {
    const years = [...new Set(f1.map((r) => r.year))].sort((a, b) => a - b);
    const top30 = new Set(summary.slice(0, 30).map((r) => r.country));
    // pandas pivots to a sorted country index; imshow draws row 0 at the top.
    const countries = [...top30].sort();

    const totals = new Map<string, number>();
    for (const row of f1) {
      if (!top30.has(row.country)) continue;
      const key = `${row.country}|${row.year}`;
      totals.set(key, (totals.get(key) ?? 0) + row.issuances);
    }

    const z = countries.map((country) => years.map((year) => totals.get(`${country}|${year}`) ?? 0));

    const data: Trace[] = [
      {
        type: "heatmap",
        z,
        x: years,
        y: countries,
        colorscale: HEAT_SCALE,
        texttemplate: "%{z:.0f}",
        textfont: { size: 9 },
        hovertemplate: "<b>%{y}</b><br>%{x}: %{z:,.0f}<extra></extra>",
      },
    ];
    const layout: ChartLayout = {
      height: 700,
      title: { text: "Annual F1 Issuances - Top 30 Countries Heatmap" },
      yaxis: { autorange: "reversed" },
      xaxis: { type: "category" },
    };
    return { data, layout };
  }, [f1, summary]);

  /** Tier distribution: country count, coloured by total F1 volume. */
  const tiers = useMemo(() => {
    const grouped = new Map<string, { countries: number; totalF1: number; oppSum: number }>();
    for (const row of summary) {
      const entry = grouped.get(row.tier) ?? { countries: 0, totalF1: 0, oppSum: 0 };
      entry.countries += 1;
      entry.totalF1 += row.f1Total;
      entry.oppSum += row.opportunityScore;
      grouped.set(row.tier, entry);
    }
    const entries = [...grouped.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

    const data: Trace[] = [
      {
        type: "bar",
        x: entries.map(([tier]) => tier),
        y: entries.map(([, value]) => value.countries),
        text: entries.map(([, value]) => String(value.countries)),
        textposition: "auto",
        marker: {
          color: entries.map(([, value]) => value.totalF1),
          colorscale: BLUE_GOLD,
          showscale: true,
          colorbar: { title: { text: "Total F1" } },
        },
        hovertemplate:
          "<b>%{x}</b><br>Countries: %{y}<br>Total F1: %{marker.color:,.0f}<extra></extra>",
      },
    ];
    const layout: ChartLayout = {
      height: 380,
      title: { text: "Market Tier Distribution" },
    };
    return { data, layout };
  }, [summary]);

  return (
    <div className="space-y-6">
      <ScopeNote label="Advanced/Analyst View">
        This page preserves deeper analytical charts for power users.
      </ScopeNote>

      <SectionTitle>Advanced Analytics</SectionTitle>

      <Chart data={bubble.data} layout={bubble.layout} height={560} />
      {bubble.plotted < bubble.total && (
        <p className="-mt-3 text-xs text-slate-500">
          Showing {bubble.plotted} of {bubble.total} countries — this chart plots only countries
          present in the dashboard&apos;s coordinate reference table.
        </p>
      )}

      <section>
        <SubHeading>Country Annual Performance Matrix</SubHeading>
        <Chart data={matrix.data} layout={matrix.layout} height={700} />
      </section>

      <Chart data={tiers.data} layout={tiers.layout} height={380} />
    </div>
  );
}

"use client";

import { useMemo } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES } from "../../../lib/dashboard/constants";
import { int } from "../../../lib/dashboard/format";
import { groupSum } from "../../../lib/dashboard/metrics";
import {
  MOVER_MIN_ISSUANCES,
  arrowPct,
  monthRangeLabel,
  risersAndFallers,
  rollingTotals,
} from "../../../lib/dashboard/rolling";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import { DownloadCsvButton, SubHeading } from "../shared";
import { DataTable, ScopeNote, SectionTitle } from "../ui";

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

/**
 * The "Consulate Intelligence" tab. (app.py showed it under a "Research: Country"
 * label; the label now matches the content.)
 */
export default function ResearchCountryTab() {
  const { data, f1Filtered, focus, focusCountry, topN } = useDashboard();

  const topPosts = useMemo(() => {
    const totals = groupSum(f1Filtered, (r) => r.post, (r) => r.issuances);
    const countryByPost = new Map(f1Filtered.map((r) => [r.post, r.country]));
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([post, issuances]) => ({ post, issuances, country: countryByPost.get(post) ?? "" }));
  }, [f1Filtered, topN]);

  const topPostsChart = useMemo(() => {
    const data: Trace[] = [
      {
        type: "bar",
        orientation: "h",
        x: topPosts.map((r) => r.issuances),
        y: topPosts.map((r) => r.post),
        text: topPosts.map((r) => int(r.issuances)),
        textposition: "auto",
        marker: { color: topPosts.map((r) => r.issuances), colorscale: BLUE_GOLD },
        hovertemplate: "<b>%{y}</b><br>F1 Issuances: %{x:,.0f}<extra></extra>",
      },
    ];
    const layout: ChartLayout = {
      height: 680,
      title: { text: `Top ${topN} F1-Issuing Consulates` },
      yaxis: { autorange: "reversed" },
    };
    return { data, layout };
  }, [topPosts, topN]);

  /* ---- Top risers and fallers: latest 12 months vs the 12 before, all F1 consulates ---- */
  const end = data.meta.coverage.postsMonthly.end;
  const postMovers = useMemo(() => {
    const rolling = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "F1" ? r.post : null));
    const { risers, fallers, qualifying } = risersAndFallers(rolling.groups);

    const chart = (rows: typeof risers, title: string, color: string) => {
      const trace: Trace = {
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
      };
      const layout: ChartLayout = {
        height: 340,
        title: { text: title },
        xaxis: { title: { text: "% change vs previous 12 months" }, ticksuffix: "%" },
        yaxis: { autorange: "reversed" },
        margin: { l: 130 },
      };
      return { data: [trace], layout, count: rows.length };
    };

    return {
      period: monthRangeLabel(rolling.current),
      qualifying,
      risers: chart(risers, "Top risers - F1 vs previous 12 months", "#4ADE80"),
      fallers: chart(fallers, "Top fallers - F1 vs previous 12 months", "#F87171"),
    };
  }, [data.postsMonthly, end]);

  /* ---- Monthly heatmap for the top 20 posts ---- */
  const heatmap = useMemo(() => {
    const posts = topPosts.slice(0, 20).map((r) => r.post);
    const postSet = new Set(posts);
    const rows = f1Filtered.filter((r) => postSet.has(r.post));
    const totals = groupSum(rows, (r) => `${r.post}|${r.month}`, (r) => r.issuances);

    // pandas pivots to a sorted index; imshow then draws row 0 at the top.
    const sortedPosts = [...postSet].sort();
    const months = [...new Set(rows.map((r) => r.month))].sort((a, b) => a - b);

    const z = sortedPosts.map((post) => months.map((month) => totals.get(`${post}|${month}`) ?? 0));

    const data: Trace[] = [
      {
        type: "heatmap",
        z,
        x: months.map((month) => MONTH_NAMES[month]),
        y: sortedPosts,
        colorscale: HEAT_SCALE,
        texttemplate: "%{z:.0f}",
        textfont: { size: 9 },
        hovertemplate: "<b>%{y}</b><br>%{x}: %{z:,.0f}<extra></extra>",
      },
    ];
    const layout: ChartLayout = {
      height: 560,
      title: { text: "Monthly F1 Issuance Heatmap by Consulate" },
      yaxis: { autorange: "reversed" },
    };
    return { data, layout };
  }, [f1Filtered, topPosts]);

  /* ---- Seasonality for the focus country's top five posts ---- */
  const focusSeasonality = useMemo(() => {
    const postTotals = groupSum(focus.f1, (r) => r.post, (r) => r.issuances);
    const top5 = [...postTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([post]) => post);

    const byMonthPost = groupSum(
      focus.f1.filter((r) => top5.includes(r.post)),
      (r) => `${r.month}|${r.post}`,
      (r) => r.issuances,
    );

    const data: Trace[] = top5.map((post) => {
      const points = [...byMonthPost.entries()]
        .filter(([key]) => key.slice(key.indexOf("|") + 1) === post)
        .map(([key, value]) => ({ month: Number(key.split("|")[0]), value }))
        .sort((a, b) => a.month - b.month);
      return {
        type: "scatter",
        mode: "lines+markers",
        name: post,
        x: points.map((p) => p.month),
        y: points.map((p) => p.value),
        line: { shape: "spline" },
      };
    });

    const layout: ChartLayout = {
      height: 380,
      title: { text: `Consulate Seasonality - ${focusCountry}` },
      hovermode: "x unified",
    };
    return { data, layout };
  }, [focus.f1, focusCountry]);

  const allPosts = useMemo(() => {
    const totals = groupSum(f1Filtered, (r) => r.post, (r) => r.issuances);
    const countryByPost = new Map(f1Filtered.map((r) => [r.post, r.country]));
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([post, issuances]) => ({ post, issuances, country: countryByPost.get(post) ?? "" }));
  }, [f1Filtered]);

  return (
    <div className="space-y-6">
      <ScopeNote label="Legacy Operational View">
        This page preserves the original recent consulate analysis and sidebar-driven filters.
      </ScopeNote>

      <SectionTitle>Consulate Intelligence</SectionTitle>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Chart data={topPostsChart.data} layout={topPostsChart.layout} height={680} />
        <div>
          {postMovers.risers.count > 0 ? (
            <Chart data={postMovers.risers.data} layout={postMovers.risers.layout} height={340} />
          ) : (
            <p className="py-6 text-sm text-slate-400">No qualifying consulate grew.</p>
          )}
          {postMovers.fallers.count > 0 ? (
            <Chart data={postMovers.fallers.data} layout={postMovers.fallers.layout} height={340} />
          ) : (
            <p className="py-6 text-sm text-slate-400">No qualifying consulate declined.</p>
          )}
          <p className="mt-2 text-xs text-slate-400">
            F1 issuances by consulate, {postMovers.period} vs the previous 12 months. Only
            consulates with at least {MOVER_MIN_ISSUANCES} F1 issuances in both 12-month periods
            are included ({postMovers.qualifying} consulates).
          </p>
        </div>
      </div>

      <section>
        <SubHeading>Monthly Issuance Heatmap - Top Posts</SubHeading>
        <Chart data={heatmap.data} layout={heatmap.layout} height={560} />
      </section>

      <section>
        <SubHeading>Consulate Detail - {focusCountry}</SubHeading>
        <Chart data={focusSeasonality.data} layout={focusSeasonality.layout} height={380} />
      </section>

      <section>
        <DataTable
          rows={allPosts}
          height={360}
          rowKey={(row) => row.post}
          columns={[
            { key: "post", header: "Consulate", render: (r) => r.post },
            { key: "issuances", header: "F1 Issuances", numeric: true, render: (r) => int(r.issuances) },
            { key: "country", header: "Country", render: (r) => r.country },
          ]}
        />
        <DownloadCsvButton
          label="Export Consulate Data CSV"
          filename="qu_consulate_data.csv"
          headers={["Consulate", "F1 Issuances", "Country"]}
          rows={allPosts.map((r) => [r.post, String(r.issuances), r.country])}
        />
      </section>
    </div>
  );
}

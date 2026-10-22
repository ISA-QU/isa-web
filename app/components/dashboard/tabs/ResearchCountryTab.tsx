"use client";

import { useMemo } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES } from "../../../lib/dashboard/constants";
import { int } from "../../../lib/dashboard/format";
import { groupSum } from "../../../lib/dashboard/metrics";
import { averagePerMonth, calendarMonthYearCounts } from "../../../lib/dashboard/periods";
import {
  MOVER_MIN_ISSUANCES,
  arrowPct,
  monthRangeLabel,
  risersAndFallers,
  rollingTotals,
} from "../../../lib/dashboard/rolling";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import { DownloadCsvButton, InfoCallout, SubHeading } from "../shared";
import { DataTable, FixedTag, SectionTitle, Slider } from "../ui";

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
  const {
    data,
    focusCountry,
    topN,
    setTopN,
    consulateCountries,
    visaFiltered,
    visaLabel,
    visa,
    periodRange,
    typical,
  } = useDashboard();

  const topPosts = useMemo(() => {
    const totals = groupSum(visaFiltered, (r) => r.post, (r) => r.issuances);
    const countryByPost = new Map(visaFiltered.map((r) => [r.post, r.country]));
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([post, issuances]) => ({ post, issuances, country: countryByPost.get(post) ?? "" }));
  }, [visaFiltered, topN]);

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
        hovertemplate: `<b>%{y}</b><br>${visaLabel} Issuances: %{x:,.0f}<extra></extra>`,
      },
    ];
    const layout: ChartLayout = {
      height: 680,
      title: { text: `Top ${topN} ${visaLabel}-Issuing Consulates, ${periodRange.label}` },
      yaxis: { autorange: "reversed" },
    };
    return { data, layout };
  }, [topPosts, topN, visaLabel, periodRange.label]);

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

  /* ---- Typical-year heatmap: the top 20 posts by typical-year volume ---- */
  // Seasonality uses the typical year (complete years except 2020–2021), not the Period.
  const heatmap = useMemo(() => {
    const postTotals = groupSum(typical.rows, (r) => r.post, (r) => r.issuances);
    const posts = [...postTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([post]) => post);
    const postSet = new Set(posts);
    const rows = typical.rows.filter((r) => postSet.has(r.post));
    const totals = groupSum(rows, (r) => `${r.post}|${r.month}`, (r) => r.issuances);

    // pandas pivots to a sorted index; imshow then draws row 0 at the top.
    const sortedPosts = [...postSet].sort();
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const yearCounts = calendarMonthYearCounts(typical.rows);
    const z = sortedPosts.map((post) =>
      months.map((month) => averagePerMonth(totals.get(`${post}|${month}`) ?? 0, month, yearCounts)),
    );

    const data: Trace[] = [
      {
        type: "heatmap",
        z,
        x: months.map((month) => MONTH_NAMES[month]),
        y: sortedPosts,
        colorscale: HEAT_SCALE,
        texttemplate: "%{z:.0f}",
        textfont: { size: 9 },
        hovertemplate: "<b>%{y}</b><br>%{x}: %{z:,.0f} average per month (typical year)<extra></extra>",
      },
    ];
    const layout: ChartLayout = {
      height: 560,
      title: { text: `${visaLabel} Issuance Heatmap by Consulate, typical year` },
      yaxis: { autorange: "reversed" },
    };
    return { data, layout };
  }, [typical, visaLabel]);

  /* ---- Typical-year seasonality for the focus country's top five posts ---- */
  const focusTypicalRows = useMemo(
    () => typical.rows.filter((r) => r.country === focusCountry),
    [typical, focusCountry],
  );
  const focusSeasonality = useMemo(() => {
    const postTotals = groupSum(focusTypicalRows, (r) => r.post, (r) => r.issuances);
    const top5 = [...postTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([post]) => post);

    const byMonthPost = groupSum(
      focusTypicalRows.filter((r) => top5.includes(r.post)),
      (r) => `${r.month}|${r.post}`,
      (r) => r.issuances,
    );
    const yearCounts = calendarMonthYearCounts(typical.rows);

    const data: Trace[] = top5.map((post) => {
      const points = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => ({
        month,
        value: averagePerMonth(byMonthPost.get(`${month}|${post}`) ?? 0, month, yearCounts),
      }));
      return {
        type: "scatter",
        mode: "lines+markers",
        name: post,
        x: points.map((p) => MONTH_NAMES[p.month]),
        y: points.map((p) => p.value),
        hovertemplate: `${post}: %{y:,.0f} average per month<extra></extra>`,
      };
    });

    const layout: ChartLayout = {
      height: 380,
      title: { text: `${visaLabel} Consulate Seasonality - ${focusCountry}, typical year` },
      hovermode: "x unified",
    };
    return { data, layout };
  }, [focusTypicalRows, focusCountry, typical, visaLabel]);

  const allPosts = useMemo(() => {
    const totals = groupSum(visaFiltered, (r) => r.post, (r) => r.issuances);
    const countryByPost = new Map(visaFiltered.map((r) => [r.post, r.country]));
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([post, issuances]) => ({ post, issuances, country: countryByPost.get(post) ?? "" }));
  }, [visaFiltered]);

  return (
    <div className="space-y-6">
      <SectionTitle>Consulate Intelligence</SectionTitle>

      <div className="max-w-xs">
        <Slider
          label="Top-N consulates"
          value={topN}
          min={10}
          max={50}
          step={5}
          onChange={setTopN}
        />
      </div>

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
            <FixedTag title="Risers and fallers ignore the Period and Visa controls.">
              Always last 12 months · F1
            </FixedTag>{" "}
            F1 issuances by consulate, {postMovers.period} vs the previous 12 months. Only
            consulates with at least {MOVER_MIN_ISSUANCES} F1 issuances in both 12-month periods
            are included ({postMovers.qualifying} consulates).
          </p>
        </div>
      </div>

      <section>
        <SubHeading>
          Monthly Issuance Heatmap - Top Posts
          <FixedTag title="Ignores the Period control.">Typical year: {typical.label}</FixedTag>
        </SubHeading>
        <Chart data={heatmap.data} layout={heatmap.layout} height={560} />
        <p className="mt-2 text-xs text-slate-400">
          Top 20 consulates by typical-year volume; average per month over complete years except
          2020–2021 (COVID).
        </p>
      </section>

      <section>
        <SubHeading>
          Consulate Detail - {focusCountry}
          <FixedTag title="Ignores the Period control.">Typical year: {typical.label}</FixedTag>
        </SubHeading>
        {!consulateCountries.has(focusCountry) ? (
          <InfoCallout>No consulate data for {focusCountry} in this view.</InfoCallout>
        ) : focusTypicalRows.length === 0 ? (
          <InfoCallout>
            No {visaLabel} consulate data for {focusCountry} in the typical years ({typical.label}).
          </InfoCallout>
        ) : (
          <Chart data={focusSeasonality.data} layout={focusSeasonality.layout} height={380} />
        )}
      </section>

      <section>
        <p className="mb-2 text-xs text-slate-400">
          All consulates, {visaLabel} issuances, {periodRange.label}.
        </p>
        <DataTable
          rows={allPosts}
          height={360}
          rowKey={(row) => row.post}
          columns={[
            { key: "post", header: "Consulate", render: (r) => r.post },
            { key: "issuances", header: `${visaLabel} Issuances`, numeric: true, render: (r) => int(r.issuances) },
            { key: "country", header: "Country", render: (r) => r.country },
          ]}
        />
        <DownloadCsvButton
          label="Export Consulate Data CSV"
          filename={`qu_consulate_data_${visa.toLowerCase()}_${periodRange.slug}.csv`}
          headers={["Consulate", `${visaLabel} Issuances`, "Country"]}
          rows={allPosts.map((r) => [r.post, String(r.issuances), r.country])}
        />
      </section>
    </div>
  );
}

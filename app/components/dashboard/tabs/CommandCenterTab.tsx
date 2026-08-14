"use client";

import { useMemo, useState } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MARKET_CATEGORIES } from "../../../lib/dashboard/constants";
import { decimals, int, metricNumber, metricPct, monthDisplay, share } from "../../../lib/dashboard/format";
import {
  buildCommandCenterFrame,
  notNa,
  recommendedOutreachWindow,
} from "../../../lib/dashboard/metrics";
import { sortBy } from "../../../lib/dashboard/sort";
import type { CommandCenterRow, VisaSelection } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import {
  Caption,
  DataScopeNotice,
  DownloadCsvButton,
  ErrorCallout,
  InfoCallout,
  MethodologyExpanders,
  SubHeading,
} from "../shared";
import { Column, DataTable, KpiCard, KpiRow, Panel, RadioGroup, Select, Slider } from "../ui";

const PRIORITY_ACTIONS = [
  "Expand Recruitment",
  "Maintain Strategic Priority",
  "Increase Digital Outreach",
  "Consider Travel",
];

const VIEWS = ["Latest Comparable Period", "Long-Term Strategy", "Current Momentum"] as const;
type View = (typeof VIEWS)[number];

const recoveryText = (value: number | null) => (notNa(value) ? value.toFixed(0) : "N/A");

export default function CommandCenterTab() {
  // The Command Center deliberately ignores the sidebar year filter — it has its
  // own controls and always reads the full operational layer, as in app.py.
  const { data } = useDashboard();
  const operational = data.operational;

  const [visa, setVisa] = useState<VisaSelection>("F1");
  const [region, setRegion] = useState("All");
  const [minVolume, setMinVolume] = useState(0);
  const [category, setCategory] = useState("All");
  const [view, setView] = useState<View>(VIEWS[0]);

  const consulateMissing = data.consulateError !== null || data.postsMonthly.length === 0;

  const frame = useMemo(
    () =>
      consulateMissing
        ? []
        : buildCommandCenterFrame(operational, data.annualCountry, data.postsMonthly, visa),
    [consulateMissing, operational, data.annualCountry, data.postsMonthly, visa],
  );

  const regionOptions = useMemo(
    () => ["All", ...[...new Set(frame.map((row) => row.region))].sort()],
    [frame],
  );
  const maxVolume = useMemo(
    () => (frame.length > 0 ? Math.max(...frame.map((row) => row.currentVolume)) : 0),
    [frame],
  );

  const filtered = useMemo(() => {
    let rows = frame.filter((row) => row.currentVolume >= minVolume);
    if (region !== "All") rows = rows.filter((row) => row.region === region);
    if (category !== "All") rows = rows.filter((row) => row.marketCategory === category);

    if (view === "Long-Term Strategy") {
      return sortBy(rows, [(r) => r.growth10yr, (r) => r.currentVolume]);
    }
    if (view === "Current Momentum") {
      return sortBy(rows, [(r) => r.latest12Momentum, (r) => r.latest12Total]);
    }
    return sortBy(rows, [(r) => r.latest12Total, (r) => r.currentVolume]);
  }, [frame, minVolume, region, category, view]);

  const latestMonthIndex = useMemo(
    () =>
      data.postsMonthly.length > 0
        ? Math.max(...data.postsMonthly.map((row) => row.monthIndex))
        : null,
    [data.postsMonthly],
  );

  if (consulateMissing) {
    return (
      <ErrorCallout>
        Recruitment Command Center could not load the historical consulate layer:{" "}
        {data.consulateError ?? "no rows available"}
      </ErrorCallout>
    );
  }

  const counts = {
    priority: filtered.filter((row) => PRIORITY_ACTIONS.includes(row.recommendedAction)).length,
    emerging: filtered.filter((row) => row.marketCategory === "Emerging").length,
    declining: filtered.filter((row) => row.marketCategory === "Declining").length,
    recovery: filtered.filter((row) => row.secondaryFlagsText.includes("Recovery Leader")).length,
    concentration: filtered.filter((row) => row.secondaryFlagsText.includes("High Concentration"))
      .length,
    seasonal: filtered.filter((row) => row.secondaryFlagsText.includes("Highly Seasonal")).length,
  };

  const latestMonthLabel = monthDisplay(latestMonthIndex);
  const partialStatus =
    latestMonthIndex !== null &&
    Math.floor(latestMonthIndex / 12) === 2025 &&
    (latestMonthIndex % 12) + 1 === 9
      ? "Jan-Sep only"
      : latestMonthLabel;

  /* ---------------------------- Action queue ---------------------------- */
  const queue = filtered.slice(0, 35);
  const queueColumns: Column<CommandCenterRow>[] = [
    { key: "country", header: "Country", render: (r) => r.country },
    { key: "category", header: "Market Category", render: (r) => r.marketCategory },
    { key: "volume", header: "Current Volume", numeric: true, render: (r) => int(r.currentVolume) },
    { key: "growth", header: "Long-Term Growth", numeric: true, render: (r) => metricPct(r.growth10yr) },
    {
      key: "momentum",
      header: "Latest 12-Month Momentum",
      numeric: true,
      render: (r) => metricPct(r.latest12Momentum),
    },
    { key: "recovery", header: "Recovery Status", numeric: true, render: (r) => recoveryText(r.recoveryIndex) },
    { key: "peak", header: "Peak Recruitment Month", render: (r) => r.peakMonthName },
    { key: "concentration", header: "Concentration Risk", render: (r) => r.concentrationRisk },
    { key: "flags", header: "Secondary Flags", render: (r) => r.secondaryFlagsText },
    { key: "action", header: "Recommended Action", render: (r) => r.recommendedAction },
    { key: "driver", header: "Primary Driver", render: (r) => r.primaryDriver },
    { key: "counter", header: "Counter-Signal", render: (r) => r.counterSignal },
    { key: "confidence", header: "Confidence", render: (r) => r.confidence },
    { key: "timing", header: "Timing", render: (r) => r.timing },
    { key: "caveat", header: "Caveat", render: (r) => r.caveat },
    { key: "evidence", header: "Evidence", render: (r) => r.evidence },
  ];

  const queueCsvRows = queue.map((r) => [
    r.country,
    r.marketCategory,
    int(r.currentVolume),
    metricPct(r.growth10yr),
    metricPct(r.latest12Momentum),
    recoveryText(r.recoveryIndex),
    r.peakMonthName,
    r.concentrationRisk,
    r.secondaryFlagsText,
    r.recommendedAction,
    r.primaryDriver,
    r.counterSignal,
    r.confidence,
    r.timing,
    r.caveat,
    r.evidence,
  ]);

  /* ------------------------------- Charts ------------------------------- */
  const topPriority = filtered
    .filter((row) => PRIORITY_ACTIONS.includes(row.recommendedAction))
    .slice(0, 15);

  const priorityChart = (() => {
    const palette = ["#FFB81C", "#3D8DDE", "#86EFAC", "#FCA5A5"];
    const categories = [...new Set(topPriority.map((r) => r.marketCategory))];
    const traces: Trace[] = categories.map((name, index) => {
      const rows = topPriority.filter((r) => r.marketCategory === name);
      return {
        type: "bar",
        orientation: "h",
        name,
        x: rows.map((r) => r.latest12Total),
        y: rows.map((r) => r.country),
        marker: { color: palette[index % palette.length] },
        hovertemplate: "<b>%{y}</b><br>Latest 12-Month Volume: %{x:,.0f}<extra></extra>",
      } as Trace;
    });
    const layout: ChartLayout = {
      height: 420,
      title: { text: "Priority Markets by Latest 12-Month Consulate Volume" },
      xaxis: { title: { text: "Latest 12-Month Volume" } },
      yaxis: { title: { text: "Country" }, autorange: "reversed" },
      barmode: "stack",
    };
    return { data: traces, layout };
  })();

  const mixChart = (() => {
    const palette = ["#FFB81C", "#3D8DDE", "#86EFAC", "#FCA5A5", "#94A3B8", "#F87171"];
    const counted = new Map<string, number>();
    for (const row of filtered) counted.set(row.marketCategory, (counted.get(row.marketCategory) ?? 0) + 1);
    const entries = [...counted.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const data: Trace[] = [
      {
        type: "bar",
        x: entries.map(([name]) => name),
        y: entries.map(([, value]) => value),
        marker: { color: entries.map((_, index) => palette[index % palette.length]) },
        hovertemplate: "<b>%{x}</b><br>Markets: %{y}<extra></extra>",
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 420,
      title: { text: "Filtered Markets by Category" },
      showlegend: false,
      xaxis: { title: { text: "Market Category" } },
      yaxis: { title: { text: "Markets" } },
    };
    return { data, layout, empty: entries.length === 0 };
  })();

  /* ------------------------------ Sub-tables ---------------------------- */
  const emerging = sortBy(
    filtered.filter((r) => r.marketCategory === "Emerging"),
    [(r) => r.latest12Momentum],
  ).slice(0, 12);

  const declining = sortBy(
    filtered.filter((r) => r.marketCategory === "Declining"),
    [(r) => r.latest12Momentum],
    true,
  ).slice(0, 12);

  const recovery = sortBy(
    filtered.filter((r) => notNa(r.recoveryIndex)),
    [(r) => r.recoveryIndex],
  ).slice(0, 12);

  const riskAlerts = filtered
    .filter(
      (r) =>
        (notNa(r.topOneShare) && r.topOneShare >= 0.45) ||
        (notNa(r.volatilityCv) && r.volatilityCv >= 0.85) ||
        (notNa(r.seasonalityRatio) && r.seasonalityRatio >= 1.7),
    )
    .slice(0, 20);

  const travel = filtered
    .filter(
      (r) =>
        [...PRIORITY_ACTIONS, "Begin Outreach Earlier"].includes(r.recommendedAction) &&
        notNa(r.peakMonth),
    )
    .slice(0, 18);

  const movers = sortBy(
    filtered.filter((r) => notNa(r.latest12Momentum)),
    [(r) => r.latest12Momentum],
  ).slice(0, 20);

  const rowKey = (row: CommandCenterRow) => row.country;

  return (
    <div className="space-y-6">
      <Panel accent="navy">
        <h4 className="mb-2 text-base font-bold text-white">
          Where should Quinnipiac focus recruitment attention, and why?
        </h4>
        <p className="text-sm leading-relaxed text-[#DDEBFA]">
          This decision-support view combines current operational monitoring, long-term country
          history, and validated monthly consulate history while keeping those data layers
          analytically separate.
        </p>
      </Panel>

      <DataScopeNotice />
      <MethodologyExpanders includeMarket />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <RadioGroup<VisaSelection>
          label="Visa Class"
          value={visa}
          options={["F1", "J1", "Both"]}
          onChange={setVisa}
        />
        <Select label="Region" value={region} options={regionOptions} onChange={setRegion} />
        <Slider
          label="Minimum Current Volume"
          value={minVolume}
          min={0}
          max={Math.max(1000, maxVolume)}
          step={500}
          onChange={setMinVolume}
          format={int}
        />
        <Select
          label="Market Category"
          value={category}
          options={["All", ...MARKET_CATEGORIES]}
          onChange={setCategory}
        />
        <Select
          label="Analysis View"
          value={view}
          options={VIEWS}
          onChange={(value) => setView(value as View)}
        />
      </div>

      <KpiRow>
        <KpiCard accent="gold" label="Priority Markets" value={metricNumber(counts.priority)} />
        <KpiCard accent="navy" label="Emerging Markets" value={metricNumber(counts.emerging)} />
        <KpiCard label="Declining Markets" value={metricNumber(counts.declining)} />
        <KpiCard accent="gold" label="Recovery Leaders" value={metricNumber(counts.recovery)} />
        <KpiCard label="High-Concentration Markets" value={metricNumber(counts.concentration)} />
        <KpiCard accent="navy" label="Highly Seasonal Markets" value={metricNumber(counts.seasonal)} />
        <KpiCard accent="gold" label="Latest Complete Month" value={latestMonthLabel} valueClassName="!text-[18px]" />
        <KpiCard label="2025 Partial-Year Status" value={partialStatus} valueClassName="!text-[18px]" />
      </KpiRow>

      <section>
        <SubHeading>Admissions Action Queue</SubHeading>
        <Caption>
          Recommendations are deterministic and evidence-based. They do not infer causes or
          enrollment outcomes.
        </Caption>
        <DataTable rows={queue} columns={queueColumns} height={430} rowKey={rowKey} />
        <DownloadCsvButton
          label="Download Command Center Action Queue CSV"
          filename="qu_recruitment_command_center_action_queue.csv"
          headers={queueColumns.map((column) => column.header)}
          rows={queueCsvRows}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <SubHeading>Top Recruitment Priorities</SubHeading>
          {topPriority.length > 0 ? (
            <Chart data={priorityChart.data} layout={priorityChart.layout} height={420} />
          ) : (
            <InfoCallout>No priority markets match the current filters.</InfoCallout>
          )}
        </section>
        <section>
          <SubHeading>Market Category Mix</SubHeading>
          {!mixChart.empty ? (
            <Chart data={mixChart.data} layout={mixChart.layout} height={420} />
          ) : (
            <InfoCallout>No markets match the current filters.</InfoCallout>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section>
          <SubHeading>Emerging Markets</SubHeading>
          {emerging.length > 0 ? (
            <DataTable
              rows={emerging}
              height={360}
              rowKey={rowKey}
              columns={[
                { key: "country", header: "Country", render: (r) => r.country },
                { key: "volume", header: "Current Volume", numeric: true, render: (r) => int(r.currentVolume) },
                { key: "momentum", header: "Momentum", numeric: true, render: (r) => metricPct(r.latest12Momentum) },
                { key: "action", header: "Action", render: (r) => r.recommendedAction },
                { key: "evidence", header: "Evidence", render: (r) => r.evidence },
              ]}
            />
          ) : (
            <InfoCallout>
              No market meets all Emerging thresholds under current filters. See the classification
              audit for nearest misses.
            </InfoCallout>
          )}
        </section>

        <section>
          <SubHeading>Declining Markets</SubHeading>
          {declining.length > 0 ? (
            <DataTable
              rows={declining}
              height={360}
              rowKey={rowKey}
              columns={[
                { key: "country", header: "Country", render: (r) => r.country },
                { key: "volume", header: "Current Volume", numeric: true, render: (r) => int(r.currentVolume) },
                { key: "momentum", header: "Momentum", numeric: true, render: (r) => metricPct(r.latest12Momentum) },
                { key: "growth", header: "10-Year Growth", numeric: true, render: (r) => metricPct(r.growth10yr) },
                { key: "action", header: "Action", render: (r) => r.recommendedAction },
              ]}
            />
          ) : (
            <InfoCallout>
              No market meets the stricter structural-decline rule under current filters.
            </InfoCallout>
          )}
        </section>

        <section>
          <SubHeading>Recovery Leaders</SubHeading>
          <DataTable
            rows={recovery}
            height={360}
            rowKey={rowKey}
            columns={[
              { key: "country", header: "Country", render: (r) => r.country },
              { key: "index", header: "Recovery Index", numeric: true, render: (r) => recoveryText(r.recoveryIndex) },
              { key: "volume", header: "Latest 12-Month Volume", numeric: true, render: (r) => int(r.latest12Total) },
              { key: "peak", header: "Peak Month", render: (r) => r.peakMonthName },
              { key: "action", header: "Action", render: (r) => r.recommendedAction },
            ]}
          />
        </section>
      </div>

      <section>
        <SubHeading>Risk and Concentration Alerts</SubHeading>
        <DataTable
          rows={riskAlerts}
          height={360}
          rowKey={rowKey}
          columns={[
            { key: "country", header: "Country", render: (r) => r.country },
            { key: "top1", header: "Top-One Share", numeric: true, render: (r) => share(r.topOneShare) },
            { key: "top3", header: "Top-Three Share", numeric: true, render: (r) => share(r.topThreeShare) },
            { key: "cv", header: "Volatility CV", numeric: true, render: (r) => decimals(r.volatilityCv, 2) },
            {
              key: "seasonality",
              header: "Seasonality Ratio",
              numeric: true,
              render: (r) => (notNa(r.seasonalityRatio) ? `${r.seasonalityRatio.toFixed(1)}x` : "N/A"),
            },
            { key: "peak", header: "Peak Month", render: (r) => r.peakMonthName },
            { key: "flags", header: "Secondary Flags", render: (r) => r.secondaryFlagsText },
            { key: "action", header: "Action", render: (r) => r.recommendedAction },
          ]}
        />
      </section>

      <section>
        <SubHeading>Travel Timing Opportunities</SubHeading>
        <DataTable
          rows={travel}
          height={360}
          rowKey={rowKey}
          columns={[
            { key: "country", header: "Country", render: (r) => r.country },
            { key: "category", header: "Category", render: (r) => r.marketCategory },
            { key: "peak", header: "Peak Month", render: (r) => r.peakMonthName },
            {
              key: "window",
              header: "Outreach Window",
              render: (r) => recommendedOutreachWindow(r.peakMonth),
            },
            { key: "volume", header: "Latest 12-Month Volume", numeric: true, render: (r) => int(r.latest12Total) },
            { key: "evidence", header: "Evidence", render: (r) => r.evidence },
          ]}
        />
      </section>

      <section>
        <SubHeading>Latest Comparable-Period Movers</SubHeading>
        <DataTable
          rows={movers}
          height={390}
          rowKey={rowKey}
          columns={[
            { key: "country", header: "Country", render: (r) => r.country },
            { key: "momentum", header: "Momentum", numeric: true, render: (r) => metricPct(r.latest12Momentum) },
            { key: "latest", header: "Latest 12 Months", numeric: true, render: (r) => int(r.latest12Total) },
            { key: "prior", header: "Prior 12 Months", numeric: true, render: (r) => int(r.prior12Total) },
            { key: "action", header: "Action", render: (r) => r.recommendedAction },
          ]}
        />
      </section>

      <section>
        <SubHeading>What Admissions Should Do Next</SubHeading>
        <Panel accent="navy">
          <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-[#DDEBFA]">
            {queue.slice(0, 6).map((row) => (
              <li key={row.country}>
                <b>{row.country}:</b> {row.recommendedAction} · {row.primaryDriver} ·{" "}
                {row.counterSignal}
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </div>
  );
}

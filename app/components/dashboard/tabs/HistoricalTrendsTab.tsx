"use client";

import { useMemo, useState } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { int, metricNumber, metricPct } from "../../../lib/dashboard/format";
import {
  buildAnnualPivot,
  calculateHistoricalRangeMetrics,
  notNa,
} from "../../../lib/dashboard/metrics";
import { sortBy } from "../../../lib/dashboard/sort";
import type { HistoricalMetricRow } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import { Caption, DownloadCsvButton, SubHeading } from "../shared";
import {
  Column,
  DataTable,
  Divider,
  Field,
  KpiCard,
  KpiRow,
  MethodologyNote,
  Panel,
  ScopeNote,
  SectionTitle,
  Select,
} from "../ui";

const rankingColumns: Column<HistoricalMetricRow>[] = [
  { key: "country", header: "Country", render: (r) => r.country },
  { key: "latest", header: "Latest F1", numeric: true, render: (r) => int(r.latestF1) },
  { key: "g5", header: "5-Year", numeric: true, render: (r) => metricPct(r.f1Growth5yrPct) },
  { key: "g10", header: "10-Year", numeric: true, render: (r) => metricPct(r.f1Growth10yrPct) },
  { key: "cagr", header: "10-Year CAGR", numeric: true, render: (r) => metricPct(r.f1Cagr10yrPct) },
  { key: "trend", header: "Trend", render: (r) => r.trendDirection },
];

export default function HistoricalTrendsTab() {
  const { data, historicalMetrics, focusCountry } = useDashboard();

  const histCountries = useMemo(
    () => [...new Set(data.annualCountry.map((r) => r.country))].sort(),
    [data.annualCountry],
  );

  const [country, setCountry] = useState(() =>
    histCountries.includes(focusCountry)
      ? focusCountry
      : histCountries.includes("India")
        ? "India"
        : (histCountries[0] ?? ""),
  );
  const [startYear, setStartYear] = useState(1997);
  const [endYear, setEndYear] = useState(2024);

  const selectedRange = useMemo(
    () =>
      data.annualCountry.filter(
        (r) => r.country === country && r.fiscalYear >= startYear && r.fiscalYear <= endYear,
      ),
    [data.annualCountry, country, startYear, endYear],
  );

  const pivot = useMemo(() => buildAnnualPivot(selectedRange), [selectedRange]);
  const metrics = useMemo(() => calculateHistoricalRangeMetrics(pivot), [pivot]);

  const chart = useMemo(() => {
    const traces: Trace[] = [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "F1",
        x: pivot.map((r) => r.fiscalYear),
        y: pivot.map((r) => r.F1),
        line: { color: "#FFB81C", width: 3 },
        marker: { size: 7, color: "#FFB81C" },
        hovertemplate: "<b>FY%{x}</b><br>F1: %{y:,.0f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: "J1",
        x: pivot.map((r) => r.fiscalYear),
        y: pivot.map((r) => r.J1),
        line: { color: "#3D8DDE", width: 3 },
        marker: { size: 7, color: "#3D8DDE" },
        hovertemplate: "<b>FY%{x}</b><br>J1: %{y:,.0f}<extra></extra>",
      },
    ];

    const showPandemicBand = startYear <= 2020 && 2020 <= endYear;
    const shapes = showPandemicBand
      ? [
          {
            type: "rect",
            xref: "x",
            yref: "paper",
            x0: 2019.6,
            x1: 2020.4,
            y0: 0,
            y1: 1,
            fillcolor: "#F87171",
            opacity: 0.14,
            line: { width: 0 },
          },
        ]
      : [];

    const annotations: Record<string, unknown>[] = [];
    if (showPandemicBand) {
      annotations.push({
        x: 2019.6,
        y: 1,
        yref: "paper",
        text: "2020 pandemic disruption",
        showarrow: false,
        xanchor: "left",
        font: { color: "#FCA5A5", size: 12 },
      });
    }
    if (metrics.peakF1Year !== null && metrics.peakF1 !== null) {
      annotations.push({
        x: metrics.peakF1Year,
        y: metrics.peakF1,
        text: `Peak F1: ${metrics.peakF1Year}`,
        showarrow: true,
        arrowhead: 2,
        ax: 32,
        ay: -48,
        font: { color: "#FFB81C", size: 12 },
        arrowcolor: "#FFB81C",
        bgcolor: "rgba(7, 21, 46, 0.88)",
        bordercolor: "rgba(255,184,28,0.55)",
      });
    }

    const layout: ChartLayout = {
      height: 520,
      title: {
        text: `Annual F1 and J1 Issuance Trends - ${country} (FY${startYear}-FY${endYear})`,
      },
      xaxis: { title: { text: "Fiscal Year" }, dtick: 2 },
      yaxis: { title: { text: "Issuances" } },
      hovermode: "x unified",
      shapes,
      annotations,
    };

    return { data: traces, layout };
  }, [pivot, country, startYear, endYear, metrics]);

  /* ---- Rankings, computed on the complete FY1997-FY2024 dataset ---- */
  const fastest = sortBy(
    historicalMetrics.filter(
      (r) => notNa(r.f1Growth10yrPct) && r.latestF1 >= 500 && r.f1Growth10yrPct > 0,
    ),
    [(r) => r.f1Growth10yrPct, (r) => r.latestF1],
  ).slice(0, 15);

  const emerging = sortBy(
    historicalMetrics.filter(
      (r) =>
        notNa(r.f1Growth10yrPct) &&
        r.latestF1 >= 500 &&
        r.latestF1 <= 15_000 &&
        r.f1Growth10yrPct >= 50,
    ),
    [(r) => r.f1Growth10yrPct, (r) => r.latestF1],
  ).slice(0, 15);

  const declining = sortBy(
    historicalMetrics.filter(
      (r) =>
        r.latestF1 >= 100 &&
        ((notNa(r.f1Growth5yrPct) && r.f1Growth5yrPct <= -25) ||
          (notNa(r.f1Growth10yrPct) && r.f1Growth10yrPct <= -25)),
    ),
    [(r) => r.f1Growth5yrPct, (r) => r.f1Growth10yrPct],
    true,
  ).slice(0, 15);

  const slug = country
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/,/g, "")
    .replace(/\//g, "_");

  return (
    <div className="space-y-6">
      <ScopeNote label="Historical Research View">
        This page preserves annual country/nationality trend analysis.
      </ScopeNote>

      <SectionTitle>Historical Trends</SectionTitle>

      <Panel accent="navy">
        <p className="leading-relaxed text-[#CBD5E1]">
          Historical Trends uses annual country/nationality-level State Department data from
          FY1997-FY2024. It does not include consulate/post-level detail. Recent operational post
          intelligence remains in Consulate Intelligence using 2023-2025 monthly data; longer monthly
          post history appears separately in Historical Consulate Intelligence.
        </p>
      </Panel>

      <Caption>
        Annual country-level F1/J1 history loaded separately from the monthly by-post operational
        dataset. Reference metrics rows loaded: {int(data.countryMetrics.length)}.
      </Caption>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Historical Country"
          value={country}
          options={histCountries}
          onChange={setCountry}
        />
        <Field label={`Historical Year Range: FY${startYear} - FY${endYear}`}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1997}
              max={2024}
              value={startYear}
              onChange={(e) => setStartYear(Math.min(Number(e.target.value), endYear))}
              className="w-full accent-[#FFB81C]"
              aria-label="Historical range start"
            />
            <input
              type="range"
              min={1997}
              max={2024}
              value={endYear}
              onChange={(e) => setEndYear(Math.max(Number(e.target.value), startYear))}
              className="w-full accent-[#FFB81C]"
              aria-label="Historical range end"
            />
          </div>
        </Field>
      </div>

      <KpiRow>
        <KpiCard accent="gold" label="Latest F1" value={metricNumber(metrics.latestF1)} />
        <KpiCard accent="navy" label="Latest J1" value={metricNumber(metrics.latestJ1)} />
        <KpiCard label="Range F1 Growth" value={metricPct(metrics.rangeGrowthPct)} />
        <KpiCard label="10-Year CAGR" value={metricPct(metrics.cagr10yrPct)} />
        <KpiCard
          label="Peak F1 Year"
          value={metrics.peakF1Year !== null ? String(metrics.peakF1Year) : "N/A"}
        />
        <KpiCard accent="navy" label="Peak F1" value={metricNumber(metrics.peakF1)} />
        <KpiCard
          accent="gold"
          label="Trend Direction"
          value={metrics.trendDirection}
          valueClassName="!text-[18px]"
        />
      </KpiRow>

      <Chart data={chart.data} layout={chart.layout} height={520} />

      <DownloadCsvButton
        label="Download Selected Historical Country CSV"
        filename={`qu_historical_${slug}_${startYear}_${endYear}.csv`}
        headers={["fiscal_year", "country", "visa_class", "issuances"]}
        rows={[...selectedRange]
          .sort((a, b) => a.fiscalYear - b.fiscalYear || (a.visa < b.visa ? -1 : 1))
          .map((r) => [String(r.fiscalYear), r.country, r.visa, String(r.issuances)])}
      />

      <Divider />

      <ScopeNote label="Scope">
        Rankings are calculated using the complete FY1997–FY2024 historical dataset.
      </ScopeNote>

      <div className="grid gap-4 xl:grid-cols-3">
        <section>
          <SubHeading>Fastest Growing Markets</SubHeading>
          <DataTable
            rows={fastest}
            columns={rankingColumns}
            height={390}
            rowKey={(row) => row.country}
          />
        </section>
        <section>
          <SubHeading>Emerging Markets</SubHeading>
          <DataTable
            rows={emerging}
            columns={rankingColumns}
            height={390}
            rowKey={(row) => row.country}
          />
        </section>
        <section>
          <SubHeading>Declining Markets</SubHeading>
          <DataTable
            rows={declining}
            columns={rankingColumns}
            height={390}
            rowKey={(row) => row.country}
          />
        </section>
      </div>

      <MethodologyNote>
        Historical annual country-level data remains source-separated from monthly by-post
        operational data. The harmonized layer resolves known country naming transitions for
        long-term trend continuity only.
      </MethodologyNote>
    </div>
  );
}

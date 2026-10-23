"use client";

import { useMemo } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { int, metricNumber, metricPct } from "../../../lib/dashboard/format";
import {
  buildAnnualPivot,
  calculateHistoricalRangeMetrics,
  notNa,
  pctGrowth,
} from "../../../lib/dashboard/metrics";
import {
  annualByYear,
  fyChange,
  fyLabel,
  provisionalFiscalYears,
} from "../../../lib/dashboard/periods";
import { arrowPct } from "../../../lib/dashboard/rolling";
import { sortBy } from "../../../lib/dashboard/sort";
import type { HistoricalMetricRow } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import { Caption, DownloadCsvButton, InfoCallout, SubHeading } from "../shared";
import {
  Column,
  DataTable,
  Divider,
  FixedTag,
  KpiCard,
  KpiRow,
  MethodologyNote,
  Panel,
  ScopeNote,
  SectionTitle,
} from "../ui";

/** The pre-pandemic comparison year. FY2020 (the COVID low) would flatter any recovery. */
const PRE_PANDEMIC_FY = 2019;

/** A rankings row: the historical metrics plus the change vs FY2019. */
interface RankingRow extends HistoricalMetricRow {
  vsPrePandemicPct: number | null;
}

export default function HistoricalTrendsTab() {
  // The country is the dashboard-wide selection, shared with the sidebar and other tabs.
  const {
    data,
    historicalMetrics,
    nationalityCountries,
    focusCountry: country,
    fyRange,
  } = useDashboard();
  // Complete fiscal years only; a year-to-date fiscal year would read as a collapse.
  const firstFy = data.meta.coverage.annual.first ?? 1997;
  const latestFy = data.meta.coverage.annual.latestComplete ?? firstFy;
  // Complete years summed from monthly reports (FY2025 today) are provisional.
  const provisional = useMemo(
    () => provisionalFiscalYears(data.meta.fiscalYears),
    [data.meta.fiscalYears],
  );
  const provisionalList = [...provisional].sort((a, b) => a - b);

  const hasData = nationalityCountries.has(country);
  // The fiscal-year range lives in the control bar's Period slot on this tab.
  const startYear = fyRange.start;
  const endYear = fyRange.end;

  const selectedRange = useMemo(
    () =>
      data.annualCountry.filter(
        (r) => r.country === country && r.fiscalYear >= startYear && r.fiscalYear <= endYear,
      ),
    [data.annualCountry, country, startYear, endYear],
  );

  const pivot = useMemo(() => buildAnnualPivot(selectedRange), [selectedRange]);
  const metrics = useMemo(() => calculateHistoricalRangeMetrics(pivot), [pivot]);

  /* ---- KPI comparisons, each naming its fiscal years ---- */
  const countryF1 = useMemo(
    () => annualByYear(data.annualCountry, country, "F1"),
    [data.annualCountry, country],
  );
  const shownYear = pivot.length > 0 ? pivot[pivot.length - 1].fiscalYear : null;
  const shownLabel = shownYear !== null ? fyLabel(shownYear, provisional) : "N/A";
  const vsPriorYear = shownYear !== null ? fyChange(countryF1, shownYear, shownYear - 1) : null;
  const vsPeak =
    metrics.latestF1 !== null && metrics.peakF1 !== null ? pctGrowth(metrics.latestF1, metrics.peakF1) : null;
  const vsPrePandemic =
    shownYear !== null && shownYear > PRE_PANDEMIC_FY
      ? fyChange(countryF1, shownYear, PRE_PANDEMIC_FY)
      : null;

  const chart = useMemo(() => {
    // Provisional years get a hollow, larger marker and say so on hover.
    const isProvisional = pivot.map((r) => provisional.has(r.fiscalYear));
    const note = isProvisional.map((p) => (p ? " (provisional, from monthly reports)" : ""));
    const marker = (color: string) => ({
      color,
      size: isProvisional.map((p) => (p ? 11 : 7)),
      symbol: isProvisional.map((p) => (p ? "circle-open" : "circle")),
      line: { color, width: 2 },
    });
    const traces: Trace[] = [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "F1",
        x: pivot.map((r) => r.fiscalYear),
        y: pivot.map((r) => r.F1),
        customdata: note,
        line: { color: "#FFB81C", width: 3 },
        marker: marker("#FFB81C"),
        hovertemplate: "<b>FY%{x}</b>%{customdata}<br>F1: %{y:,.0f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: "J1",
        x: pivot.map((r) => r.fiscalYear),
        y: pivot.map((r) => r.J1),
        customdata: note,
        line: { color: "#3D8DDE", width: 3 },
        marker: marker("#3D8DDE"),
        hovertemplate: "<b>FY%{x}</b>%{customdata}<br>J1: %{y:,.0f}<extra></extra>",
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
      // The "Peak F1" callout sits just above the peak point. Put this label in the
      // other half of the chart (bottom when the peak is in the top half, top
      // otherwise) so the two can never overlap.
      const maxValue = Math.max(0, ...pivot.map((r) => Math.max(r.F1, r.J1)));
      const peakInTopHalf = metrics.peakF1 !== null && maxValue > 0 && metrics.peakF1 / maxValue > 0.5;
      annotations.push({
        x: 2019.6,
        y: peakInTopHalf ? 0.02 : 0.98,
        yref: "paper",
        yanchor: peakInTopHalf ? "bottom" : "top",
        text: "2020 pandemic disruption",
        showarrow: false,
        xanchor: "left",
        font: { color: "#FCA5A5", size: 12 },
        bgcolor: "rgba(7, 21, 46, 0.75)",
      });
    }
    for (const row of pivot) {
      if (!provisional.has(row.fiscalYear)) continue;
      annotations.push({
        x: row.fiscalYear,
        y: Math.max(row.F1, row.J1),
        text: `FY${row.fiscalYear} provisional`,
        showarrow: false,
        yshift: 20,
        font: { color: "#CBD5E1", size: 11 },
      });
    }
    if (metrics.peakF1Year !== null && metrics.peakF1 !== null) {
      annotations.push({
        x: metrics.peakF1Year,
        y: metrics.peakF1,
        text: `Peak F1: FY${metrics.peakF1Year}`,
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
  }, [pivot, country, startYear, endYear, metrics, provisional]);

  /* ---- Rankings: latest complete fiscal year, vs FY2019 and over 10 years ---- */
  const rankYear = historicalMetrics[0]?.latestYear ?? latestFy;
  const rankYearLabel = fyLabel(rankYear, provisional);
  const rankings = useMemo<RankingRow[]>(() => {
    const preF1 = new Map<string, number>();
    for (const row of data.annualCountry) {
      if (row.visa !== "F1" || row.fiscalYear !== PRE_PANDEMIC_FY) continue;
      preF1.set(row.country, (preF1.get(row.country) ?? 0) + row.issuances);
    }
    return historicalMetrics.map((row) => ({
      ...row,
      vsPrePandemicPct: pctGrowth(row.latestF1, preF1.get(row.country) ?? null),
    }));
  }, [data.annualCountry, historicalMetrics]);

  const rankingColumns: Column<RankingRow>[] = [
    { key: "country", header: "Country", render: (r) => r.country },
    { key: "latest", header: `F1 ${rankYearLabel}`, numeric: true, render: (r) => int(r.latestF1) },
    {
      key: "vs2019",
      header: `vs FY${PRE_PANDEMIC_FY}`,
      numeric: true,
      render: (r) => metricPct(r.vsPrePandemicPct),
    },
    {
      key: "g10",
      header: `10-yr (FY${rankYear - 10}→FY${rankYear})`,
      numeric: true,
      render: (r) => metricPct(r.f1Growth10yrPct),
    },
    {
      key: "cagr",
      header: `CAGR FY${rankYear - 10}–FY${rankYear}`,
      numeric: true,
      render: (r) => metricPct(r.f1Cagr10yrPct),
    },
  ];

  // One growth table (the old "Fastest Growing" and "Emerging" lists overlapped).
  const growing = sortBy(
    rankings.filter((r) => notNa(r.f1Growth10yrPct) && r.latestF1 >= 500 && r.f1Growth10yrPct > 0),
    [(r) => r.f1Growth10yrPct, (r) => r.latestF1],
  ).slice(0, 15);

  const declining = sortBy(
    rankings.filter(
      (r) =>
        r.latestF1 >= 100 &&
        ((notNa(r.vsPrePandemicPct) && r.vsPrePandemicPct <= -25) ||
          (notNa(r.f1Growth10yrPct) && r.f1Growth10yrPct <= -25)),
    ),
    [(r) => r.vsPrePandemicPct, (r) => r.f1Growth10yrPct],
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
          FY{firstFy}-FY{latestFy}. It does not include consulate/post-level detail: monthly figures
          by consulate, recent and since Mar 2017, are on the Consulates page.
        </p>
      </Panel>

      <Caption>
        Annual country-level F1/J1 history loaded separately from the monthly by-post operational
        dataset. Only complete fiscal years are included
        {provisionalList.length > 0 &&
          `; ${provisionalList.map((y) => `FY${y}`).join(", ")} ${provisionalList.length > 1 ? "are" : "is"} provisional (summed from monthly reports)`}
        .
      </Caption>

      <p className="text-xs text-slate-400">
        {country} · fiscal years FY{startYear} – FY{endYear}, both set in the control bar above.
      </p>

      {!hasData && (
        <InfoCallout>
          No nationality data for {country} in this view. The annual tables have no rows for it.
        </InfoCallout>
      )}

      {hasData && (
        <>
          <KpiRow>
            <KpiCard
              accent="gold"
              label={`F1 by nationality, ${shownLabel}`}
              value={metricNumber(metrics.latestF1)}
            />
            <KpiCard
              accent="navy"
              label={`J1 by nationality, ${shownLabel}`}
              value={metricNumber(metrics.latestJ1)}
            />
            <KpiCard
              label={
                shownYear !== null
                  ? `F1 by nationality, FY${shownYear} vs FY${shownYear - 1}`
                  : "F1 by nationality, year on year"
              }
              value={arrowPct(vsPriorYear)}
              title={
                shownYear !== null
                  ? `FY${shownYear - 1}: ${metricNumber(countryF1.get(shownYear - 1) ?? null)}`
                  : undefined
              }
            />
            <KpiCard
              label={`F1 by nationality vs peak (${metrics.peakF1Year !== null ? `FY${metrics.peakF1Year}` : "N/A"})`}
              value={metrics.peakF1Year === shownYear && shownYear !== null ? "At peak" : arrowPct(vsPeak)}
            />
            <KpiCard
              label={`F1 by nationality vs FY${PRE_PANDEMIC_FY} (pre-pandemic)`}
              value={arrowPct(vsPrePandemic)}
              title={`FY${PRE_PANDEMIC_FY}: ${metricNumber(countryF1.get(PRE_PANDEMIC_FY) ?? null)}`}
            />
            <KpiCard
              label={
                shownYear !== null
                  ? `10-Year CAGR by nationality, FY${shownYear - 10}–FY${shownYear}`
                  : "10-Year CAGR by nationality"
              }
              value={arrowPct(metrics.cagr10yrPct)}
            />
            <KpiCard accent="navy" label="Peak F1 by nationality" value={metricNumber(metrics.peakF1)} />
            <KpiCard
              label="Peak F1 year"
              value={metrics.peakF1Year !== null ? `FY${metrics.peakF1Year}` : "N/A"}
            />
          </KpiRow>
          {shownYear !== null && provisional.has(shownYear) && (
            <p className="-mt-4 text-xs text-slate-400">
              FY{shownYear}
              {" is provisional: it is summed from the monthly nationality reports because our annual "}
              source doesn&apos;t include FY{shownYear} yet.
            </p>
      )}

          <Chart data={chart.data} layout={chart.layout} height={520} />

          <DownloadCsvButton
            label="Download Selected Historical Country CSV"
            filename={`qu_historical_${slug}_${startYear}_${endYear}.csv`}
            headers={["fiscal_year", "country", "visa_class", "issuances"]}
            rows={[...selectedRange]
              .sort((a, b) => a.fiscalYear - b.fiscalYear || (a.visa < b.visa ? -1 : 1))
              .map((r) => [String(r.fiscalYear), r.country, r.visa, String(r.issuances)])}
          />
        </>
      )}

      <Divider />

      <ScopeNote label="Scope">
        <FixedTag title="The rankings ignore the fiscal-year range.">
          FY{rankYear - 10}–FY{rankYear}, vs FY{PRE_PANDEMIC_FY}
        </FixedTag>{" "}
        Rankings compare {rankYearLabel} F1 issuances by nationality with FY{PRE_PANDEMIC_FY}{" "}
        (pre-pandemic) and FY{rankYear - 10}. Growing: at least 500 F1 in FY{rankYear} and up over
        10 years. Declining: at least 100 F1 in FY{rankYear} and down 25% or more vs FY
        {PRE_PANDEMIC_FY} or over 10 years.
        {provisional.has(rankYear) &&
          ` FY${rankYear} is provisional (summed from monthly reports).`}
      </ScopeNote>

      <div className="grid gap-4 xl:grid-cols-2">
        <section>
          <SubHeading>Growing Markets</SubHeading>
          <DataTable
            rows={growing}
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

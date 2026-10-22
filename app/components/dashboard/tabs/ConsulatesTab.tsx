"use client";

import { useMemo } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES, MONTH_NAMES_FULL } from "../../../lib/dashboard/constants";
import { decimals, int, metricPct, monthDisplay } from "../../../lib/dashboard/format";
import { groupSum, regionForCountry, seasonalityCv } from "../../../lib/dashboard/metrics";
import { averagePerMonth, calendarMonthYearCounts } from "../../../lib/dashboard/periods";
import { arrowPct, monthRangeLabel, rollingTotals } from "../../../lib/dashboard/rolling";
import type { CountrySummaryRow } from "../../../lib/dashboard/types";

/** A rankings row: the country summary plus its latest-12-month figures. */
interface RankingRow extends CountrySummaryRow {
  f1Last12: number;
  j1Last12: number;
  f1Change: number | null;
}
import Chart from "../Chart";
import ComparePicker from "../ComparePicker";
import { useDashboard } from "../DashboardContext";
import { InfoCallout, SubHeading } from "../shared";
import { DataTable, Divider, FixedTag, KpiCard, KpiRow, ScopeNote, SectionTitle } from "../ui";

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
    summary,
    dfFiltered,
    f1Filtered,
    compareCountries,
    setCompareCountries,
    data,
    periodRange,
    consulateCountries,
    visaFiltered,
    focusRows,
    visaLabel,
    typical,
  } = useDashboard();
  // Active Posts and Seasonality CV follow the control bar's visa (F1 by default).
  const activePosts = new Set(focusRows.map((r) => r.post)).size;
  const focusCv = seasonalityCv(focusRows);

  /* ---- Latest 12 months vs the 12 before, by issuing country (ignores the Years filter) ---- */
  const end = data.meta.coverage.postsMonthly.end;
  const last12 = useMemo(() => {
    const f1 = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "F1" ? r.country : null));
    const j1 = rollingTotals(data.postsMonthly, end, (r) => (r.visa === "J1" ? r.country : null));
    return { f1: f1.groups, j1: j1.groups, current: f1.current, prior: f1.prior };
  }, [data.postsMonthly, end]);
  const period = monthRangeLabel(last12.current);
  const priorPeriod = monthRangeLabel(last12.prior);

  // The months Active Posts, Seasonality CV and the charts cover (the control bar's Period).
  const filterYearsText = periodRange.label;

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

  /* ---- Monthly trend for the control bar's visa, stacked by year ---- */
  const trend = useMemo(() => {
    const palette = ["#3D8DDE", "#FFB81C", "#86EFAC"];
    const byPeriod = groupSum(
      focusRows,
      (r) => `${r.year}-${String(r.month).padStart(2, "0")}`,
      (r) => r.issuances,
    );
    const years = [...new Set(focusRows.map((r) => r.year))].sort((a, b) => a - b);
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
      title: { text: `Monthly ${visaLabel} Trend - ${focusCountry}, ${periodRange.label}` },
      hovermode: "x unified",
      xaxis: { tickangle: -45, categoryorder: "category ascending" },
    };
    return { data, layout };
  }, [focusRows, focusCountry, visaLabel, periodRange.label]);

  /* ---- Top 10 consulates ---- */
  const topPosts = useMemo(() => {
    const rows = [...groupSum(focusRows, (r) => r.post, (r) => r.issuances).entries()]
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
        hovertemplate: `<b>%{y}</b><br>${visaLabel} Issuances: %{x:,.0f}<extra></extra>`,
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 420,
      title: { text: `Top ${visaLabel} Consulates, ${periodRange.label}` },
      yaxis: { autorange: "reversed" },
    };
    return { data, layout };
  }, [focusRows, visaLabel, periodRange.label]);

  /* ---- Seasonality by calendar month ---- */
  // Average per calendar month: Jan-Feb can have one more year of data than the
  // other months, so summing would overstate them. Year counts come from the
  // whole filtered dataset, so a month with no issuances for this country counts.
  // Bars: the typical year (complete years except 2020–2021), whatever the
  // Period. Gold line: the selected Period's average per month, for contrast.
  const seasonality = useMemo(() => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const typicalRows = typical.rows.filter((r) => r.country === focusCountry);
    const typicalTotals = groupSum(typicalRows, (r) => r.month, (r) => r.issuances);
    const typicalCounts = calendarMonthYearCounts(typical.rows);
    const typicalAvg = months.map((m) => averagePerMonth(typicalTotals.get(m) ?? 0, m, typicalCounts));

    const periodCounts = calendarMonthYearCounts(visaFiltered);
    const periodTotals = groupSum(focusRows, (r) => r.month, (r) => r.issuances);
    const periodAvg = months.map((m) =>
      (periodCounts.get(m) ?? 0) > 0 ? averagePerMonth(periodTotals.get(m) ?? 0, m, periodCounts) : null,
    );

    const data: Trace[] = [
      {
        type: "bar",
        name: `Typical year (${typical.label})`,
        x: months.map((month) => MONTH_NAMES[month]),
        y: typicalAvg,
        customdata: months.map((month) => typicalCounts.get(month) ?? 0),
        marker: { color: "#3D8DDE" },
        hovertemplate:
          `<b>%{x}</b><br>Typical year: %{y:,.0f} ${visaLabel} per month<br>Years averaged: %{customdata}<extra></extra>`,
      } as Trace,
      {
        type: "scatter",
        mode: "lines+markers",
        name: periodRange.label,
        x: months.map((month) => MONTH_NAMES[month]),
        y: periodAvg,
        line: { color: "#FFB81C", width: 3 },
        marker: { color: "#FFB81C", size: 7 },
        connectgaps: false,
        hovertemplate: `<b>%{x}</b><br>${periodRange.label}: %{y:,.0f} per month<extra></extra>`,
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 380,
      title: { text: `${visaLabel} Seasonality - ${focusCountry}, average per month` },
      legend: { orientation: "h", y: -0.18 },
    };
    return { data, layout };
  }, [focusRows, focusCountry, visaFiltered, visaLabel, periodRange.label, typical]);

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
      title: { text: `F1 vs J1 Trends - ${focusCountry}, ${periodRange.label}` },
      hovermode: "x unified",
    };
    return { data, layout };
  }, [dfFiltered, focusCountry, periodRange.label]);

  /* ---- Multi-country comparison ---- */
  // Default: the top five markets by F1 in the selected Period. Presets: the same
  // top five, and one per region (top markets by F1 in the Period, up to 8).
  const COMPARE_MAX = 8;
  const f1ByCountry = useMemo(() => {
    const totals = groupSum(f1Filtered, (r) => r.country, (r) => r.issuances);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([country]) => country);
  }, [f1Filtered]);
  const topFive = f1ByCountry.slice(0, 5);
  const compareList = compareCountries ?? topFive;
  const compareOptions = useMemo(() => [...consulateCountries].sort(), [consulateCountries]);
  const comparePresets = useMemo(() => {
    const regions = [...new Set(f1ByCountry.map(regionForCountry))]
      .filter((region) => region !== "Other")
      .sort();
    return [
      { label: `Top 5 markets (${periodRange.label})`, values: topFive },
      ...regions.map((region) => ({
        label: region,
        values: f1ByCountry.filter((c) => regionForCountry(c) === region).slice(0, COMPARE_MAX),
      })),
    ];
  }, [f1ByCountry, topFive, periodRange.label]);

  const comparison = useMemo(() => {
    const rows = visaFiltered.filter((r) => compareList.includes(r.country));
    const byMonthCountry = groupSum(
      rows,
      (r) => `${r.year * 12 + (r.month - 1)}|${r.country}`,
      (r) => r.issuances,
    );
    const data: Trace[] = compareList.map((country) => {
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
      title: { text: `${visaLabel} Issuance Comparison Over Time, ${periodRange.label}` },
      hovermode: "x unified",
    };
    return { data, layout };
  }, [visaFiltered, compareList, visaLabel, periodRange.label]);

  return (
    <div className="space-y-6">
      <ScopeNote label="Legacy Operational View">
        This page preserves the original recent country analysis. Country, Visa and Period come
        from the control bar.
      </ScopeNote>

      <SectionTitle>
        Country Intelligence - <b>{focusCountry}</b>
      </SectionTitle>

      {!consulateCountries.has(focusCountry) ? (
        <InfoCallout>No consulate data for {focusCountry} in this view.</InfoCallout>
      ) : (
        <>
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
            <KpiCard label={`Active Posts (${visaLabel})`} value={activePosts} />
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
            <KpiCard label={`Seasonality CV (${visaLabel})`} value={decimals(focusCv, 2)} />
          </KpiRow>
          <p className="-mt-4 text-xs text-slate-400">
            <FixedTag title="These three cards ignore the Period control.">
              12-month cards: always last 12 months
            </FixedTag>{" "}
            F1 and J1 issuances and the F1 change cover the last 12 months ({period}, compared with{" "}
            {priorPeriod}), by the country where the visa was issued, and always use the last
            12 months whatever the Period. Active Posts and Seasonality CV follow the Period: {filterYearsText}.
          </p>

          <Divider />

          {focusRows.length === 0 ? (
            <InfoCallout>
              No {visaLabel} consulate data for {focusCountry} in {filterYearsText}.
            </InfoCallout>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <Chart data={trend.data} layout={trend.layout} height={420} />
                <Chart data={topPosts.data} layout={topPosts.layout} height={420} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Chart data={seasonality.data} layout={seasonality.layout} height={380} />
                  <p className="mt-2 text-xs text-slate-400">
                    <FixedTag title="The bars ignore the Period control.">
                      Typical year: {typical.label}
                    </FixedTag>{" "}
                    Bars: average per month over complete years except 2020–2021 (COVID). Gold
                    line: {periodRange.inSentence}.
                  </p>
                </div>
                <Chart data={bothVisas.data} layout={bothVisas.layout} height={380} />
              </div>
            </>
          )}
        </>
      )}

      <section>
        <SubHeading>Multi-Country Comparison</SubHeading>
        <div className="mb-3 max-w-3xl">
          <ComparePicker
            label="Compare countries"
            noun="countries"
            options={compareOptions}
            value={compareList}
            onChange={setCompareCountries}
            presets={comparePresets}
            max={COMPARE_MAX}
          />
          {compareCountries === null && (
            <p className="mt-1 text-xs text-slate-400">
              Showing the default: top 5 markets by F1 in {periodRange.label}.
            </p>
          )}
        </div>
        {compareList.length > 0 ? (
          <Chart data={comparison.data} layout={comparison.layout} height={420} />
        ) : (
          <InfoCallout>Add a country or pick a preset to compare.</InfoCallout>
        )}
      </section>

      <section>
        <SubHeading>
          Full Country Rankings
          <FixedTag title="The rankings ignore the Period and Visa controls.">
            Always last 12 months
          </FixedTag>
        </SubHeading>
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

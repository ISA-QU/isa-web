"use client";

import { useMemo, useState } from "react";
import type { ChartLayout, Trace } from "./Chart";

import {
  DOWNTURN_SHARE,
  COUNTRY_SPLITS,
  INDEX_BASE_YEAR,
  chinaNote,
  countryDownturnView,
  countryVsWorld,
  MAJOR_MARKET_MIN,
  REBOUND_YEARS,
  findDownturns,
  fiscalYearSeries,
  latestSignal,
  recoverySummary,
  seriesByCountry,
  worldSeries,
  type Downturn,
  type YearValue,
} from "../../lib/dashboard/cycles";
import { EMPTY_OVERLAY, EVENTS, eventOverlay, withEvents } from "../../lib/dashboard/events";
import { int, monthDisplay } from "../../lib/dashboard/format";
import { LOW_VOLUME, MIN_BASE } from "../../lib/dashboard/measures";
import { selectedVisaClasses } from "../../lib/dashboard/metrics";
import { fyLabel, provisionalFiscalYears } from "../../lib/dashboard/periods";
import { arrowPct } from "../../lib/dashboard/rolling";
import { MONTH_NAMES } from "../../lib/dashboard/constants";
import Chart from "./Chart";
import { EventsList, EventsToggle } from "./EventsControls";
import { useDashboard } from "./DashboardContext";
import { SubHeading } from "./shared";
import { DataTable, FixedTag, Panel } from "./ui";

const WORLD_COLOR = "#FFB81C";
const EX_CHINA_COLOR = "#2DD4BF";
const C3 = EVENTS.find((e) => e.id === "C3");

/** A downturn row for the tables: the series it belongs to and its figures. */
type DownturnRow = Downturn & { series: string; reboundLowVolume?: boolean };

/**
 * Market cycles (2b-1), at the top of Historical Trends: world visas by
 * nationality over 30 years with downturn bands, a recovery summary, the latest
 * signal from the monthly data, and downturn tables for the world and the
 * selected country. Information only.
 */
export default function MarketCycles() {
  const { data, visa, visaLabel, focusCountry, showEvents } = useDashboard();
  const visas = useMemo(() => selectedVisaClasses(visa), [visa]);
  const first = data.meta.coverage.annual.first ?? 1997;
  // Complete fiscal years only: the partial year (FY2026 today) is left off.
  const last = data.meta.coverage.annual.latestComplete ?? first;
  const provisional = useMemo(() => provisionalFiscalYears(data.meta.fiscalYears), [data.meta.fiscalYears]);
  const lastIsProvisional = provisional.has(last);
  const partial = data.meta.fiscalYears.find((f) => !f.complete && f.fiscalYear > last);

  const lines = useMemo(() => worldSeries(data.annualCountry, visas, first, last), [data.annualCountry, visas, first, last]);
  const worldDownturns = useMemo(() => findDownturns(lines.world), [lines.world]);
  const exChinaDownturns = useMemo(() => findDownturns(lines.excludingChina), [lines.excludingChina]);

  // The recovery summary is always F1 (students), whatever the Visa control shows.
  const summary = useMemo(
    () => recoverySummary(seriesByCountry(data.annualCountry, ["F1"], first, last)),
    [data.annualCountry, first, last],
  );

  const signal = useMemo(
    () =>
      data.nationalityMonthly
        ? latestSignal(data.nationalityMonthly, visas, data.meta.coverage.postsMonthly.end)
        : null,
    [data.nationalityMonthly, visas, data.meta.coverage.postsMonthly.end],
  );

  const countrySeries = useMemo(
    () => fiscalYearSeries(data.annualCountry.filter((r) => r.country === focusCountry), visas, first, last),
    [data.annualCountry, focusCountry, visas, first, last],
  );
  // Minimum base (100) and country splits: see countryDownturnView.
  const countryView = useMemo(() => countryDownturnView(focusCountry, countrySeries), [focusCountry, countrySeries]);

  // 2b-1b: the selected country against the world (same visas), indexed to FY2019 = 100.
  const [compareView, setCompareView] = useState<"index" | "share">("index");
  const visaWordsAll = visas.length === 2 ? "F1 or J1" : visas[0];
  const vsWorld = useMemo(
    () =>
      countrySeries.some((p) => p.value > 0) && !COUNTRY_SPLITS[focusCountry]
        ? countryVsWorld(focusCountry, countrySeries, lines.world, { visaWords: visaWordsAll, latestProvisional: lastIsProvisional })
        : null,
    [focusCountry, countrySeries, lines.world, visaWordsAll, lastIsProvisional],
  );
  const chinaFacts = useMemo(() => chinaNote(lines.world, lines.excludingChina), [lines]);
  const compareChart = useMemo(() => {
    if (!vsWorld) return null;
    const isProvisional = lines.world.map((p) => provisional.has(p.year));
    const marker = (color: string) => ({
      color,
      size: isProvisional.map((p) => (p ? 11 : 6)),
      symbol: isProvisional.map((p) => (p ? "circle-open" : "circle")),
      line: { color, width: 2 },
    });
    const traceOf = (name: string, series: YearValue[], color: string, suffix: string, digits: number): Trace => ({
      type: "scatter",
      mode: "lines+markers",
      name,
      x: series.map((p) => p.year),
      y: series.map((p) => p.value),
      customdata: isProvisional.map((p) => (p ? " (provisional)" : "")),
      line: { color, width: 3 },
      marker: marker(color),
      hovertemplate: `${name}: %{y:,.${digits}f}${suffix}%{customdata}<extra></extra>`,
    });
    const share = compareView === "share" && vsWorld.share !== null;
    const traces: Trace[] = share
      ? [traceOf(`${focusCountry}, share of world`, vsWorld.share!, WORLD_COLOR, "%", 2)]
      : [
          ...(vsWorld.countryIndex ? [traceOf(focusCountry, vsWorld.countryIndex, WORLD_COLOR, "", 0)] : []),
          traceOf("World", vsWorld.worldIndex, "#E2E8F0", "", 0),
        ];
    const layout: ChartLayout = {
      height: 380,
      title: {
        text: share
          ? `${focusCountry}: share of world ${visaLabel} visas, FY${first}–FY${last}`
          : `${focusCountry} and the world, ${visaLabel}, FY${INDEX_BASE_YEAR} = 100`,
      },
      xaxis: { title: { text: "Fiscal Year" }, dtick: 2 },
      yaxis: { title: { text: share ? "% of world visas" : `Index (FY${INDEX_BASE_YEAR} = 100)` }, rangemode: "tozero", ...(share ? { ticksuffix: "%" } : {}) },
      hovermode: "x unified",
      legend: { orientation: "h", y: -0.2 },
      shapes: share
        ? []
        : [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 100, y1: 100, line: { dash: "dot", color: "#94A3B8", width: 1 } }],
    };
    return { traces, layout };
  }, [vsWorld, compareView, lines.world, provisional, focusCountry, visaLabel, first, last]);

  const chart = useMemo(() => {
    const isProvisional = lines.world.map((p) => provisional.has(p.year));
    const note = isProvisional.map((p) => (p ? " (provisional, from monthly reports)" : ""));
    const line = (name: string, series: YearValue[], color: string): Trace => ({
      type: "scatter",
      mode: "lines+markers",
      name,
      x: series.map((p) => p.year),
      y: series.map((p) => p.value),
      customdata: note,
      line: { color, width: 3 },
      marker: {
        color,
        size: isProvisional.map((p) => (p ? 11 : 6)),
        symbol: isProvisional.map((p) => (p ? "circle-open" : "circle")),
        line: { color, width: 2 },
      },
      hovertemplate: `${name}: %{y:,.0f}%{customdata}<extra></extra>`,
    });
    const traces = [
      line("World", lines.world, WORLD_COLOR),
      line("World excluding mainland China", lines.excludingChina, EX_CHINA_COLOR),
    ];
    // Downturn bands from peak to trough on the World line, labelled with depth and recovery.
    const shapes = worldDownturns.map((d) => ({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0: d.peakYear,
      x1: d.troughYear,
      y0: 0,
      y1: 1,
      fillcolor: "#94A3B8",
      opacity: 0.13,
      line: { width: 0 },
      layer: "below",
    }));
    const annotations = worldDownturns.map((d) => ({
      x: (d.peakYear + d.troughYear) / 2,
      y: 0.97,
      yref: "paper",
      yanchor: "top",
      text: `▼ ${Math.abs(d.depthPct).toFixed(0)}% · ${d.regainedYear !== null ? `regained FY${d.regainedYear}` : "not yet regained"}`,
      showarrow: false,
      font: { color: "#E2E8F0", size: 11 },
      bgcolor: "rgba(7, 21, 46, 0.8)",
    }));
    const layout: ChartLayout = {
      height: 460,
      title: { text: `${visaLabel} visas by nationality, world, FY${first}–FY${last}` },
      xaxis: { title: { text: "Fiscal Year" }, dtick: 2 },
      yaxis: { title: { text: "Issuances" } },
      hovermode: "x unified",
      legend: { orientation: "h", y: -0.18 },
      shapes,
      annotations,
    };
    return { traces, layout };
  }, [lines, worldDownturns, provisional, visaLabel, first, last]);

  // Events (2a): global major events, as on the country chart below.
  const dataEnd = data.meta.coverage.postsMonthly.end;
  const events = useMemo(
    () =>
      showEvents
        ? eventOverlay({ axis: { kind: "fiscalYear", start: first, end: last }, dataEnd, country: null, globalDetail: false })
        : EMPTY_OVERLAY,
    [showEvents, first, last, dataEnd],
  );
  const eventChart = useMemo(() => withEvents(chart.traces, chart.layout, events), [chart, events]);

  const fy = (year: number) => fyLabel(year, provisional);
  const notYet = `Not yet${lastIsProvisional ? ` (FY${last} provisional)` : ""}`;
  const years = (n: number | null) => (n === null ? "N/A" : `${Number.isInteger(n) ? n : n.toFixed(1)} year${n === 1 ? "" : "s"}`);
  const pct = (n: number) => `${Math.round(n)}%`;

  const tableColumns = (withSeries: boolean) => [
    ...(withSeries ? [{ key: "series", header: "Series", render: (r: DownturnRow) => r.series }] : []),
    { key: "peak", header: "Peak", render: (r: DownturnRow) => `${fy(r.peakYear)} · ${int(r.peak)}` },
    { key: "trough", header: "Trough", render: (r: DownturnRow) => `${fy(r.troughYear)} · ${int(r.trough)}` },
    { key: "depth", header: "Depth from peak", numeric: true, render: (r: DownturnRow) => arrowPct(r.depthPct) },
    {
      key: "rebound",
      header: `Rebound within ${REBOUND_YEARS} years of trough`,
      numeric: true,
      render: (r: DownturnRow) =>
        r.reboundPct === null ? "—" : r.reboundLowVolume ? LOW_VOLUME : arrowPct(r.reboundPct),
    },
    {
      key: "regained",
      header: "Regained peak",
      render: (r: DownturnRow) => (r.regainedYear !== null ? `${fy(r.regainedYear)} · ${int(r.regained ?? 0)}` : notYet),
    },
    {
      key: "high",
      header: "Later new high",
      render: (r: DownturnRow) =>
        r.newHighYear !== null ? `Yes, ${fy(r.newHighYear)}` : r.regainedYear !== null ? "Not yet" : "—",
    },
  ];

  const worldRows: DownturnRow[] = [
    ...worldDownturns.map((d) => ({ ...d, series: "World" })),
    ...exChinaDownturns.map((d) => ({ ...d, series: "World excluding mainland China" })),
  ];
  const countryRows: DownturnRow[] =
    countryView.kind === "rows" ? countryView.rows.map((d) => ({ ...d, series: focusCountry })) : [];
  const visaWords = visas.length === 2 ? "F1 or J1" : visas[0];

  const signalMonth = (index: number) => MONTH_NAMES[(index % 12) + 1];
  const signalText = signal
    ? `FY${signal.fiscalYear} so far (${signal.monthsLabel}): ${signal.changePct === null ? "N/A" : arrowPct(signal.changePct)} vs the same months of FY${signal.fiscalYear - 1} (${int(signal.current)} vs ${int(signal.prior)})${
        signal.reading === "no-bottom"
          ? ` — no sign of a bottom yet in data through ${monthDisplay(signal.dataEnd)}.`
          : signal.reading === "narrowing"
            ? ` — the decline is narrowing in data through ${monthDisplay(signal.dataEnd)}.`
            : ` — up on a year earlier, in data through ${monthDisplay(signal.dataEnd)}.`
      }`
    : null;

  return (
    <section className="space-y-4">
      <SubHeading>
        Market cycles
        <FixedTag title="Uses every complete fiscal year; ignores the fiscal-year range set in the control bar.">
          FY{first}–FY{last} · follows the Visa control
        </FixedTag>
      </SubHeading>
      <p className="text-sm text-slate-300">
        {visaLabel} visas by nationality, all countries, over 30 years: downturns, and whether markets came back.
      </p>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="mb-1 flex justify-end">
            <EventsToggle />
          </div>
          <Chart data={eventChart.traces} layout={eventChart.layout} height={460} />
          <EventsList overlay={events} />
        </div>
        <Panel accent="gold">
          <h4 className="mb-2 flex flex-wrap items-center gap-2 text-base font-bold text-white">
            Recovery summary
            <FixedTag title="Always F1 (students), whatever the Visa control shows.">Always F1</FixedTag>
          </h4>
          <p className="leading-relaxed text-[#DDEBFA]">
            Since FY{first}, {pct(summary.recoveredPct)} of major market downturns fully recovered, typically
            within {years(summary.medianYears)} of the low.{" "}
            {`After COVID, ${pct((summary.postCovid.above / Math.max(1, summary.postCovid.markets)) * 100)} of markets were above their FY2019 level by FY2023.`}{" "}
            Past recoveries don&apos;t guarantee future ones.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-300">
            <li>
              Major markets: {summary.markets} countries with {MAJOR_MARKET_MIN}+ F1 visas in their best year;{" "}
              {summary.downturns} downturns, {summary.recovered} fully recovered (median {years(summary.medianYears)} from
              the low to regaining the peak).
            </li>
            <li>
              Downturns from peaks in FY2000–FY2002 (around 9/11): {summary.early.recovered} of {summary.early.downturns}{" "}
              recovered (median {years(summary.early.medianYears)}).
            </li>
            <li>
              COVID: {summary.postCovid.above} of {summary.postCovid.markets} markets with {MAJOR_MARKET_MIN}+ F1 in FY2019
              were above that level in FY2023.
            </li>
            {lastIsProvisional && <li>Includes FY{last}, which is provisional.</li>}
          </ul>
        </Panel>
      </div>

      {chinaFacts && (
        <p className="text-xs text-slate-400">
          World excluding mainland China: shown because mainland China alone was {chinaFacts.chinaSharePct.toFixed(1)}% of
          all {visaLabel} visas in FY{chinaFacts.peakYear}; without it, the rest of the world was back to{" "}
          {Math.round(chinaFacts.restPctOfPeak)}% of its FY{chinaFacts.peakYear} level by FY{chinaFacts.bestYear}.
        </p>
      )}

      {signalText && signal && (
        <div className="rounded-md border border-sky-300/20 bg-sky-500/[0.06] px-3 py-2 text-sm text-slate-200">
          <span className="mr-2 text-[10px] font-extrabold uppercase tracking-wider text-sky-300">Latest signal</span>
          <b className="text-white">{signalText}</b>{" "}
          <span className="text-xs text-slate-400">
            {visaLabel}, monthly nationality data, countries only. Latest 3 months vs a year earlier:{" "}
            {signal.latestMonths
              .map((m) => `${signalMonth(m.monthIndex)} ${m.changePct === null ? "N/A" : arrowPct(m.changePct)}`)
              .join(", ")}
            . &quot;No sign of a bottom yet&quot; while each of the latest 3 months is 20%+ below a year earlier.
          </span>
        </div>
      )}

      <div className="space-y-1 text-xs leading-relaxed text-slate-400">
        <p>
          Part of China&apos;s post-2015 drop reflects 5-year visa validity from Nov 2014 (fewer renewals).
          {C3 && (
            <>
              {" "}
              <a href={C3.source} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">
                Source
              </a>
            </>
          )}
        </p>
        <p>
          {lastIsProvisional &&
            `FY${last} is provisional: summed from the monthly reports (the State Department notes monthly reports since FY2020 shouldn't simply be added up for annual totals); official annual figures will replace it. `}
          {partial && `FY${partial.fiscalYear} (${partial.monthsIncluded} months so far) is left off the chart.`}
        </p>
      </div>

      <div className="rounded-md border border-slate-400/15 bg-white/[0.02] p-3">
        <h4 className="mb-2 text-sm font-bold text-white">
          {focusCountry} compared with the world ({visaLabel})
        </h4>
        {vsWorld && compareChart ? (
          <>
            {vsWorld.share !== null && (
              <div role="radiogroup" aria-label="Comparison view" className="mb-2 inline-flex rounded-md border border-slate-400/25 bg-[#07152E] p-0.5">
                {(
                  [
                    ["index", `Index, FY${INDEX_BASE_YEAR} = 100`],
                    ["share", "Share of world visas"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={compareView === value}
                    onClick={() => setCompareView(value)}
                    className={`rounded px-3 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#FFB81C] ${
                      compareView === value ? "bg-[#FFB81C] text-[#0C2340]" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <Chart data={compareChart.traces} layout={compareChart.layout} height={380} />
            {vsWorld.countryIndex === null && (
              <p className="mt-1 text-xs text-slate-400">
                {focusCountry}&apos;s line isn&apos;t drawn: its FY{INDEX_BASE_YEAR} base is under 100 (low volume).
              </p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-white">{vsWorld.sentence}</p>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {COUNTRY_SPLITS[focusCountry]
              ? `${focusCountry} split in ${COUNTRY_SPLITS[focusCountry].year}; compare ${COUNTRY_SPLITS[focusCountry].successors.join(" or ")} with the world instead.`
              : `No ${visaWordsAll} visas for ${focusCountry} in the annual data.`}
          </p>
        )}
      </div>

      <div>
        <h4 className="mb-1 text-sm font-bold text-white">Downturns: world ({visaLabel})</h4>
        <DataTable<DownturnRow>
          rows={worldRows}
          height={200}
          rowKey={(r) => `${r.series}-${r.peakYear}`}
          columns={tableColumns(true)}
          empty="No 20%+ downturn since the data starts."
        />
      </div>
      <div>
        <h4 className="mb-1 text-sm font-bold text-white">
          Downturns: {focusCountry} ({visaLabel})
        </h4>
        {countryView.kind === "rows" ? (
          <DataTable<DownturnRow>
            rows={countryRows}
            height={220}
            rowKey={(r) => `${r.peakYear}`}
            columns={tableColumns(false)}
            empty={`No 20%+ downturn from a peak of ${MIN_BASE}+ for ${focusCountry} since FY${first}.`}
          />
        ) : (
          <p className="text-sm text-slate-400">
            {countryView.kind === "split"
              ? `${focusCountry} split in ${countryView.year}; later visas are counted under ${countryView.successors.join(" and under ")}${
                  countryView.lastYear !== null
                    ? ` (last ${visaWords} visas recorded under this name: FY${countryView.lastYear})`
                    : ""
                }.`
              : countryView.kind === "too-few"
                ? `Too few visas for a downturn history (${focusCountry}'s best year: ${int(countryView.best)} in FY${countryView.bestYear}).`
                : `No ${visaWords} visas for ${focusCountry} in the annual data.`}
          </p>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Rule: a downturn starts when a year is {Math.round((1 - DOWNTURN_SHARE) * 100)}%+ below the highest year so far
        and ends when that peak is regained. &quot;Peak&quot; means the highest since FY{first}, where the data starts.
        Rebound: the best year within {REBOUND_YEARS} years of the low, vs the low.
      </p>
    </section>
  );
}

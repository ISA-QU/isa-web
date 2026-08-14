"use client";

import { useMemo, useState } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES, MONTH_NAMES_FULL, VISA_COLORS } from "../../../lib/dashboard/constants";
import {
  compactMonthRange,
  decimals,
  int,
  metricDecimal,
  metricNumber,
  metricPct,
  monthCountBetween,
  monthDisplay,
  share,
} from "../../../lib/dashboard/format";
import {
  concentrationLabel,
  groupSum,
  idxMaxNumeric,
  notNa,
  postPeriodMetrics,
  recommendedOutreachWindow,
  selectedVisaClasses,
  sumBy,
} from "../../../lib/dashboard/metrics";
import { sortBy } from "../../../lib/dashboard/sort";
import type { PostMonthlyRow, PostPeriodMetrics, VisaSelection } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import {
  Caption,
  DownloadCsvButton,
  ErrorCallout,
  InfoCallout,
  SubHeading,
} from "../shared";
import {
  DataTable,
  Expander,
  KpiCard,
  KpiRow,
  MethodologyNote,
  MultiSelect,
  Panel,
  RadioGroup,
  ScopeNote,
  SectionTitle,
  Select,
} from "../ui";

/** monthIndex helpers for the fixed coverage windows. */
const monthIndexOf = (year: number, month: number) => year * 12 + (month - 1);
const FULL_START = monthIndexOf(2017, 3);
const FULL_END = monthIndexOf(2025, 9);

interface Coverage {
  key: string;
  label: string;
  start: number;
  end: number;
  format: string | null;
}

const COVERAGE_OPTIONS: Coverage[] = [
  {
    key: "Complete History - Mar 2017 to Sep 2025",
    label: "Complete History",
    start: FULL_START,
    end: FULL_END,
    format: null,
  },
  {
    key: "PDF Era Only - Mar 2017 to Sep 2022",
    label: "PDF Era Only",
    start: monthIndexOf(2017, 3),
    end: monthIndexOf(2022, 9),
    format: "PDF",
  },
  {
    key: "Excel Era Only - Oct 2022 to Sep 2025",
    label: "Excel Era Only",
    start: monthIndexOf(2022, 10),
    end: monthIndexOf(2025, 9),
    format: "Excel",
  },
];

const QUICK_RANGES = [
  "Complete History",
  "Last 12 Months",
  "Last 24 Months",
  "Last 5 Years",
  "Pre-Pandemic Through Recovery",
  "Custom Range",
] as const;
type QuickRange = (typeof QUICK_RANGES)[number];

const SORT_OPTIONS = [
  "Latest 12 Months",
  "Full History",
  "Recovery",
  "Growth",
  "Country Share",
] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const SEASONALITY_STATS = ["Average", "Median", "Maximum"] as const;
type SeasonalityStat = (typeof SEASONALITY_STATS)[number];

interface ComparisonRow extends PostPeriodMetrics {
  post: string;
  shareOfCountry: number | null;
}

export default function HistoricalConsulatesTab() {
  const { data } = useDashboard();
  const consulate = data.postsMonthly;

  const countries = useMemo(
    () => [...new Set(consulate.map((r) => r.country))].sort(),
    [consulate],
  );

  const [country, setCountry] = useState(() =>
    countries.includes("India") ? "India" : (countries[0] ?? ""),
  );
  const [postSelection, setPostSelection] = useState<string | null>(null);
  const [visa, setVisa] = useState<VisaSelection>("Both");
  const [quickRange, setQuickRange] = useState<QuickRange>("Complete History");
  const [coverageKey, setCoverageKey] = useState(COVERAGE_OPTIONS[0].key);
  const [customStart, setCustomStart] = useState<number | null>(null);
  const [customEnd, setCustomEnd] = useState<number | null>(null);
  const [comparePosts, setComparePosts] = useState<string[] | null>(null);
  const [annualMode, setAnnualMode] = useState<string | null>(null);
  const [seasonalityStat, setSeasonalityStat] = useState<SeasonalityStat>("Average");
  const [sortOption, setSortOption] = useState<SortOption>("Latest 12 Months");
  const [recoveryVisibleOnly, setRecoveryVisibleOnly] = useState(false);

  const visaClasses = selectedVisaClasses(visa);
  const coverage = COVERAGE_OPTIONS.find((c) => c.key === coverageKey) ?? COVERAGE_OPTIONS[0];

  const countryBase = useMemo(
    () => consulate.filter((r) => r.country === country),
    [consulate, country],
  );
  const postOptions = useMemo(
    () => [...new Set(countryBase.map((r) => r.post))].sort(),
    [countryBase],
  );

  /** Posts ranked by full-history F1 volume, used for defaults. */
  const f1PostRanking = useMemo(
    () =>
      [...groupSum(countryBase.filter((r) => r.visa === "F1"), (r) => r.post, (r) => r.issuances).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([post]) => post),
    [countryBase],
  );

  const defaultPost = f1PostRanking[0] ?? postOptions[0] ?? "";
  const post = postSelection && postOptions.includes(postSelection) ? postSelection : defaultPost;

  const coverageMonthOptions = useMemo(
    () =>
      [...new Set(consulate.map((r) => r.monthIndex))]
        .filter((index) => index >= coverage.start && index <= coverage.end)
        .sort((a, b) => a - b),
    [consulate, coverage],
  );

  /* ---- Active range: quick range clamped to the coverage window ---- */
  const [startIndex, endIndex] = useMemo((): [number, number] => {
    let requestedStart: number;
    let requestedEnd: number;
    if (quickRange === "Last 12 Months") {
      requestedStart = coverage.end - 11;
      requestedEnd = coverage.end;
    } else if (quickRange === "Last 24 Months") {
      requestedStart = coverage.end - 23;
      requestedEnd = coverage.end;
    } else if (quickRange === "Last 5 Years") {
      requestedStart = coverage.end - 59;
      requestedEnd = coverage.end;
    } else if (quickRange === "Pre-Pandemic Through Recovery") {
      requestedStart = monthIndexOf(2019, 1);
      requestedEnd = monthIndexOf(2022, 12);
    } else {
      requestedStart = coverage.start;
      requestedEnd = coverage.end;
    }

    if (quickRange === "Custom Range" && coverageMonthOptions.length > 0) {
      return [
        customStart ?? coverageMonthOptions[0],
        customEnd ?? coverageMonthOptions[coverageMonthOptions.length - 1],
      ];
    }
    return [
      Math.max(requestedStart, coverage.start),
      Math.min(requestedEnd, coverage.end),
    ];
  }, [quickRange, coverage, coverageMonthOptions, customStart, customEnd]);

  const matchesFormat = (row: PostMonthlyRow) =>
    coverage.format === null || row.sourceFormat === coverage.format;

  const periodCountry = useMemo(
    () =>
      consulate.filter(
        (r) =>
          r.country === country &&
          r.monthIndex >= startIndex &&
          r.monthIndex <= endIndex &&
          visaClasses.includes(r.visa) &&
          matchesFormat(r),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [consulate, country, startIndex, endIndex, visa, coverage],
  );

  const selected = useMemo(
    () => periodCountry.filter((r) => r.post === post),
    [periodCountry, post],
  );

  const postCoverageBase = useMemo(
    () =>
      consulate.filter(
        (r) =>
          r.country === country &&
          r.post === post &&
          visaClasses.includes(r.visa) &&
          r.monthIndex >= coverage.start &&
          r.monthIndex <= coverage.end &&
          matchesFormat(r),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [consulate, country, post, visa, coverage],
  );

  const defaultComparePosts = useMemo(() => {
    const top = f1PostRanking.filter((p) => postOptions.includes(p)).slice(0, 5);
    return top.includes(post) ? top : [post, ...top.slice(0, 4)];
  }, [f1PostRanking, postOptions, post]);

  const selectedComparePosts = comparePosts ?? defaultComparePosts;

  if (data.consulateError) {
    return (
      <ErrorCallout>
        Historical Consulate Intelligence could not load: {data.consulateError}
      </ErrorCallout>
    );
  }
  if (consulate.length === 0) {
    return <InfoCallout>Historical consulate records are not available.</InfoCallout>;
  }

  const header = (
    <>
      <ScopeNote label="Historical Research View">
        This page preserves the dedicated monthly by-post history workspace.
      </ScopeNote>

      <SectionTitle>Historical Consulate Intelligence</SectionTitle>

      <Panel accent="navy">
        <h4 className="mb-2 text-base font-bold text-white">
          Monthly F1 and J1 issuance history by U.S. embassy or consulate, March 2017-September 2025.
        </h4>
        <p className="leading-relaxed text-[#DDEBFA]">
          This page uses the validated monthly by-post historical consulate layer only. 2025 includes
          January-September only and must not be interpreted as a complete annual total. Visa
          issuance volume is a directional student-mobility and consular-workload signal, not an
          individual approval probability.
        </p>
      </Panel>

      <Panel>
        <div className="text-base font-extrabold text-white">Historical Consulate Filters</div>
        <div className="text-[13px] text-[#BFD2E6]">
          These controls apply only to Historical Consulate Intelligence. The global operational
          sidebar filters do not change this page.
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Country" value={country} options={countries} onChange={setCountry} />
        <Select label="Consulate" value={post} options={postOptions} onChange={setPostSelection} />
        <RadioGroup<VisaSelection>
          label="Visa Class"
          value={visa}
          options={["Both", "F1", "J1"]}
          onChange={setVisa}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <RadioGroup
          label="Quick Range"
          value={quickRange}
          options={QUICK_RANGES}
          onChange={(value) => setQuickRange(value as QuickRange)}
        />

        <div>
          {quickRange === "Custom Range" && coverageMonthOptions.length > 0 ? (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Select
                label="Custom Range Start"
                value={monthDisplay(startIndex)}
                options={coverageMonthOptions.map(monthDisplay)}
                onChange={(value) =>
                  setCustomStart(
                    coverageMonthOptions.find((index) => monthDisplay(index) === value) ?? null,
                  )
                }
              />
              <Select
                label="Custom Range End"
                value={monthDisplay(endIndex)}
                options={coverageMonthOptions.map(monthDisplay)}
                onChange={(value) =>
                  setCustomEnd(
                    coverageMonthOptions.find((index) => monthDisplay(index) === value) ?? null,
                  )
                }
              />
            </div>
          ) : null}
          <Panel className="!mb-0 !p-4">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#FFDF87]">
              Active Range
            </div>
            <div className="mt-1 text-lg font-extrabold text-white">
              {compactMonthRange(startIndex, endIndex)}
            </div>
            <div className="mt-1 text-xs text-[#BFD2E6]">
              {coverage.label} · {monthCountBetween(startIndex, endIndex)} selected months
            </div>
          </Panel>
        </div>
      </div>

      <Expander title="Advanced Data Filters">
        <RadioGroup
          label="Data Coverage"
          value={coverageKey}
          options={COVERAGE_OPTIONS.map((c) => c.key)}
          onChange={setCoverageKey}
        />
        <Caption>
          PDF and Excel describe the publication format used by the State Department. Selecting one
          format limits the analysis to that source era and therefore changes totals and coverage.
        </Caption>
      </Expander>

      {coverage.label !== "Complete History" && (
        <div className="rounded-md border border-[rgba(255,184,28,0.45)] bg-[rgba(255,184,28,0.1)] p-4 text-sm text-[#FFDF87]">
          {coverage.label} is active: totals and charts reflect only{" "}
          {compactMonthRange(coverage.start, coverage.end)}. PDF and Excel are source-publication
          eras, not different student populations.
        </div>
      )}

      <MultiSelect
        label="Compare Posts"
        options={postOptions}
        values={selectedComparePosts}
        onChange={(values) => setComparePosts(values.slice(0, 5))}
      />
    </>
  );

  if (startIndex > endIndex || selected.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <InfoCallout>
          No historical consulate records match the selected filters. Try Complete History or a wider
          date range.
        </InfoCallout>
      </div>
    );
  }

  /* -------------------------- Headline metrics -------------------------- */
  const monthlyWide = new Map<number, { F1: number; J1: number }>();
  for (const row of selected) {
    const entry = monthlyWide.get(row.monthIndex) ?? { F1: 0, J1: 0 };
    entry[row.visa] += row.issuances;
    monthlyWide.set(row.monthIndex, entry);
  }
  const monthIndexes = [...monthlyWide.keys()].sort((a, b) => a - b);
  const latestIndex = monthIndexes[monthIndexes.length - 1];

  const includesF1 = visaClasses.includes("F1");
  const includesJ1 = visaClasses.includes("J1");

  const f1Series = includesF1 ? monthIndexes.map((i) => monthlyWide.get(i)!.F1) : [];
  const j1Series = includesJ1 ? monthIndexes.map((i) => monthlyWide.get(i)!.J1) : [];

  const latestF1 = includesF1 ? monthlyWide.get(latestIndex)!.F1 : null;
  const latestJ1 = includesJ1 ? monthlyWide.get(latestIndex)!.J1 : null;

  const peakIndexFor = (series: number[]) => {
    if (series.length === 0 || Math.max(...series) <= 0) return null;
    return monthIndexes[series.indexOf(Math.max(...series))];
  };
  const peakF1Month = peakIndexFor(f1Series);
  const peakJ1Month = peakIndexFor(j1Series);
  const peakF1Value = f1Series.length > 0 ? Math.max(...f1Series) : null;
  const peakJ1Value = j1Series.length > 0 ? Math.max(...j1Series) : null;

  const totalF1 = includesF1
    ? sumBy(selected.filter((r) => r.visa === "F1"), (r) => r.issuances)
    : null;
  const totalJ1 = includesJ1
    ? sumBy(selected.filter((r) => r.visa === "J1"), (r) => r.issuances)
    : null;
  const avgF1 =
    includesF1 && f1Series.length > 0 ? f1Series.reduce((a, b) => a + b, 0) / f1Series.length : null;
  const avgJ1 =
    includesJ1 && j1Series.length > 0 ? j1Series.reduce((a, b) => a + b, 0) / j1Series.length : null;
  const activeMonths = new Set(selected.map((r) => r.monthIndex)).size;

  const coverageCompleteness =
    coverage.label === "Complete History"
      ? { main: `${activeMonths} months`, detail: "100% validated" }
      : {
          main: compactMonthRange(
            Math.min(...selected.map((r) => r.monthIndex)),
            Math.max(...selected.map((r) => r.monthIndex)),
          ),
          detail: `${activeMonths} months · ${coverage.label.toLowerCase()}`,
        };

  const countryTotal = sumBy(periodCountry, (r) => r.issuances);
  const selectedTotal = sumBy(selected, (r) => r.issuances);
  const selectedShare = countryTotal ? selectedTotal / countryTotal : null;
  const selectedMetrics = postPeriodMetrics(selected);

  const countryPostTotals = [...groupSum(periodCountry, (r) => r.post, (r) => r.issuances).values()].sort(
    (a, b) => b - a,
  );
  const topOneShare =
    countryTotal && countryPostTotals.length > 0 ? countryPostTotals[0] / countryTotal : null;
  const topThreeShare =
    countryTotal && countryPostTotals.length > 0
      ? countryPostTotals.slice(0, 3).reduce((a, b) => a + b, 0) / countryTotal
      : null;

  const insights: string[] = [];
  if (selectedShare !== null) {
    insights.push(
      `${post} represented ${share(selectedShare)} of ${country}'s selected-period F1/J1 issuance.`,
    );
  }
  if (selectedMetrics.seasonalityRatio !== null) {
    insights.push(
      `${selectedMetrics.peakMonthName} averages ${decimals(selectedMetrics.seasonalityRatio, 1)} times the post's monthly mean.`,
    );
  }
  if (selectedMetrics.latest12Change !== null) {
    insights.push(
      `Latest 12-month issuance changed ${metricPct(selectedMetrics.latest12Change)} versus the preceding comparable 12 months.`,
    );
  }
  if (selectedMetrics.recoveryIndex !== null) {
    insights.push(
      `Latest comparable recovery index is ${selectedMetrics.recoveryIndex.toFixed(0)} versus the 2019 baseline of 100.`,
    );
  }
  if (coverage.label !== "Complete History") {
    insights.push(
      `Source coverage limitation: ${coverage.label} limits this analysis to ${compactMonthRange(coverage.start, coverage.end)}.`,
    );
  }
  if (insights.length === 0) {
    insights.push(
      "Comparable history is limited for the selected filters; use N/A metrics cautiously.",
    );
  }

  /* ------------------------------ Charts ------------------------------- */
  const monthlyTrace: Trace[] = (["F1", "J1"] as const)
    .filter((v) => visaClasses.includes(v))
    .map((v) => {
      const points = monthIndexes.map((index) => ({
        index,
        value: monthlyWide.get(index)![v],
      }));
      const eraByIndex = new Map(selected.map((r) => [r.monthIndex, r.sourceFormat]));
      return {
        type: "scatter",
        mode: "lines+markers",
        name: v,
        x: points.map((p) => monthDisplay(p.index)),
        y: points.map((p) => p.value),
        line: { color: VISA_COLORS[v], width: 3 },
        marker: { size: 6, color: VISA_COLORS[v] },
        customdata: points.map((p) => [
          monthDisplay(p.index),
          post,
          v,
          p.value,
          eraByIndex.get(p.index) ?? "",
        ]),
        hovertemplate:
          "<b>%{customdata[0]}</b><br>Post: %{customdata[1]}<br>Visa class: %{customdata[2]}<br>" +
          "Issuances: %{customdata[3]:,.0f}<br>Source era: %{customdata[4]} Reports<extra></extra>",
      };
    });

  const monthlyLayout: ChartLayout = {
    height: 500,
    title: {
      text: `Monthly F1/J1 Trend - ${post}, ${country}<br><sup>${coverage.label}: ${compactMonthRange(startIndex, endIndex)}</sup>`,
    },
    hovermode: "x unified",
    xaxis: { title: { text: "Month" } },
    yaxis: { title: { text: "Issuances" } },
    legend: { title: { text: "Visa Class" } },
  };

  /* ---- Annual aggregation ---- */
  const has2025 = selected.some((r) => r.year === 2025);
  const effectiveAnnualMode =
    annualMode ?? (has2025 ? "Comparable Jan-Sep totals" : "Calendar-year totals");
  const comparableJanSep = effectiveAnnualMode === "Comparable Jan-Sep totals";
  const annualSource = comparableJanSep ? selected.filter((r) => r.month <= 9) : selected;

  const annualTotals = groupSum(
    annualSource,
    (r) => `${r.year}|${r.visa}`,
    (r) => r.issuances,
  );
  const annualYears = [...new Set(annualSource.map((r) => r.year))].sort((a, b) => a - b);
  const yearLabel = (year: number) =>
    comparableJanSep
      ? `${year} Jan-Sep`
      : year === 2025
        ? "2025 YTD through September"
        : String(year);

  const annualTraces: Trace[] = (["F1", "J1"] as const)
    .filter((v) => visaClasses.includes(v))
    .map((v) => ({
      type: "bar",
      name: v,
      x: annualYears.map(yearLabel),
      y: annualYears.map((year) => annualTotals.get(`${year}|${v}`) ?? 0),
      text: annualYears.map((year) => int(annualTotals.get(`${year}|${v}`) ?? 0)),
      textposition: "outside",
      cliponaxis: false,
      marker: { color: VISA_COLORS[v] },
    }));

  const annualLayout: ChartLayout = {
    height: 440,
    barmode: "group",
    title: { text: `Annual Issuances - ${post}` },
    xaxis: { title: { text: "Calendar Year" } },
    yaxis: { title: { text: "Issuances" } },
  };

  /* ---- Seasonality ---- */
  const aggregate = (values: number[], stat: SeasonalityStat): number => {
    if (values.length === 0) return 0;
    if (stat === "Maximum") return Math.max(...values);
    if (stat === "Average") return values.reduce((a, b) => a + b, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const monthBuckets = (rows: PostMonthlyRow[]) => {
    const buckets = new Map<number, number[]>();
    for (const row of rows) {
      const list = buckets.get(row.month);
      if (list) list.push(row.issuances);
      else buckets.set(row.month, [row.issuances]);
    }
    return buckets;
  };

  const seasonalityTraces: Trace[] = visaClasses.map((v) => {
    const buckets = monthBuckets(selected.filter((r) => r.visa === v));
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    return {
      type: "bar",
      name: v,
      x: months.map((m) => MONTH_NAMES[m]),
      y: months.map((m) => aggregate(buckets.get(m) ?? [], seasonalityStat)),
      marker: { color: VISA_COLORS[v] },
    };
  });

  const combinedBuckets = monthBuckets(selected);
  const combinedByMonth = new Map(
    [...combinedBuckets.entries()].map(([month, values]) => [
      month,
      aggregate(values, seasonalityStat),
    ]),
  );
  const peakMonthNum = combinedByMonth.size > 0 ? idxMaxNumeric(combinedByMonth) : null;
  const peakMonthLabel = peakMonthNum !== null ? (MONTH_NAMES_FULL[peakMonthNum] ?? "N/A") : "N/A";
  const combinedSum = [...combinedByMonth.values()].reduce((a, b) => a + b, 0);
  const peakConcentration =
    combinedByMonth.size > 0 && combinedSum
      ? (Math.max(...combinedByMonth.values()) / combinedSum) * 100
      : null;
  const outreachWindow = recommendedOutreachWindow(peakMonthNum);

  const seasonalityLayout: ChartLayout = {
    height: 410,
    barmode: "group",
    title: { text: `${seasonalityStat} Calendar-Month Seasonality - ${post}` },
    xaxis: {
      title: { text: "Calendar Month" },
      categoryorder: "array",
      categoryarray: Object.values(MONTH_NAMES),
    },
    yaxis: { title: { text: `${seasonalityStat} Issuances` } },
  };

  /* ---- Consulate comparison ---- */
  const byPost = new Map<string, PostMonthlyRow[]>();
  for (const row of periodCountry) {
    const list = byPost.get(row.post);
    if (list) list.push(row);
    else byPost.set(row.post, [row]);
  }
  const comparisonRows: ComparisonRow[] = [...byPost.entries()].map(([postName, rows]) => {
    const metrics = postPeriodMetrics(rows);
    return {
      ...metrics,
      post: postName,
      shareOfCountry: countryTotal ? metrics.total / countryTotal : null,
    };
  });

  const sortKey: Record<SortOption, (row: ComparisonRow) => number | null> = {
    "Latest 12 Months": (r) => r.latest12,
    "Full History": (r) => r.total,
    Recovery: (r) => r.recoveryIndex,
    Growth: (r) => r.latest12Change,
    "Country Share": (r) => r.shareOfCountry,
  };
  const comparisonTable = sortBy(comparisonRows, [sortKey[sortOption]]);

  const firstBy = (key: (row: ComparisonRow) => number | null) =>
    comparisonRows.length > 0 ? sortBy(comparisonRows, [key])[0].post : "N/A";
  const strongestPost = comparisonTable.length > 0 ? comparisonTable[0].post : "N/A";
  const fastestPost = firstBy((r) => r.latest12Change);
  const seasonalPost = firstBy((r) => r.seasonalityRatio);
  const concentrationPost = firstBy((r) => r.shareOfCountry);

  const comparisonMonthly = periodCountry.filter((r) => selectedComparePosts.includes(r.post));
  const comparisonByPostMonth = groupSum(
    comparisonMonthly,
    (r) => `${r.monthIndex}|${r.post}`,
    (r) => r.issuances,
  );
  const compareTraces: Trace[] = selectedComparePosts.map((postName) => {
    const points = [...comparisonByPostMonth.entries()]
      .filter(([key]) => key.slice(key.indexOf("|") + 1) === postName)
      .map(([key, value]) => ({ index: Number(key.split("|")[0]), value }))
      .sort((a, b) => a.index - b.index);
    return {
      type: "scatter",
      mode: "lines",
      name: postName,
      x: points.map((p) => monthDisplay(p.index)),
      y: points.map((p) => p.value),
      line: { width: 3 },
    };
  });

  /* ---- Recovery index ---- */
  const recoverySource = recoveryVisibleOnly ? selected : postCoverageBase;
  const recoveryRows: Array<{ year: string; visa: string; index: number }> = [];
  const recoveryReasons: string[] = [];
  for (const v of visaClasses) {
    const visaRows = recoverySource.filter((r) => r.visa === v);
    const baseline2019 = sumBy(visaRows.filter((r) => r.year === 2019), (r) => r.issuances);
    const baselineJanSep = sumBy(
      visaRows.filter((r) => r.year === 2019 && r.month <= 9),
      (r) => r.issuances,
    );
    if (baseline2019 <= 0) {
      recoveryReasons.push(
        `${v}: ${
          coverage.label === "Excel Era Only"
            ? "selected source-era filter excludes required 2019 history"
            : "selected post had no positive 2019 baseline"
        }`,
      );
      continue;
    }
    for (const year of [2019, 2020, 2021, 2022, 2023, 2024]) {
      const value = sumBy(visaRows.filter((r) => r.year === year), (r) => r.issuances);
      if (value > 0) {
        recoveryRows.push({ year: String(year), visa: v, index: (value / baseline2019) * 100 });
      }
    }
    const value2025 = sumBy(
      visaRows.filter((r) => r.year === 2025 && r.month <= 9),
      (r) => r.issuances,
    );
    if (value2025 > 0 && baselineJanSep > 0) {
      recoveryRows.push({
        year: "2025 Jan-Sep",
        visa: v,
        index: (value2025 / baselineJanSep) * 100,
      });
    }
  }

  const recoveryTraces: Trace[] = [...new Set(recoveryRows.map((r) => r.visa))].map((v) => {
    const points = recoveryRows.filter((r) => r.visa === v);
    return {
      type: "scatter",
      mode: "lines+markers",
      name: v,
      x: points.map((p) => p.year),
      y: points.map((p) => p.index),
      line: { width: 3, color: VISA_COLORS[v] },
      marker: { size: 8, color: VISA_COLORS[v] },
    };
  });

  const recoveryLayout: ChartLayout = {
    height: 410,
    title: { text: "Recovery Index: 2019 Baseline = 100" },
    yaxis: { title: { text: "Recovery Index" } },
    legend: { title: { text: "Visa Class" } },
    shapes: [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        y0: 100,
        y1: 100,
        line: { dash: "dot", color: "#FFB81C" },
      },
    ],
    annotations: [
      {
        xref: "paper",
        x: 1,
        y: 100,
        text: "2019 baseline",
        showarrow: false,
        font: { color: "#FFB81C", size: 11 },
      },
    ],
  };

  /* ---- How admissions can use this ---- */
  let recoveryStatus = "N/A";
  if (selectedMetrics.recoveryIndex !== null) {
    recoveryStatus =
      selectedMetrics.recoveryIndex >= 105
        ? "Above 2019 comparable baseline"
        : selectedMetrics.recoveryIndex >= 90
          ? "Near 2019 comparable baseline"
          : "Below 2019 comparable baseline";
  }

  const monthTotalsSeries = monthIndexes.map(
    (i) => monthlyWide.get(i)!.F1 + monthlyWide.get(i)!.J1,
  );
  let maxPctChange = 0;
  for (let i = 1; i < monthTotalsSeries.length; i += 1) {
    const previous = monthTotalsSeries[i - 1];
    if (previous === 0) continue;
    maxPctChange = Math.max(maxPctChange, Math.abs((monthTotalsSeries[i] - previous) / previous));
  }
  const monitoring =
    monthIndexes.length > 1 && maxPctChange > 1
      ? "Large month-over-month changes should be reviewed"
      : "No extreme month-over-month change flagged in selected range";

  const admissionsCards: Array<[string, string]> = [
    [
      "Recruitment Timing",
      `Recommended outreach: ${outreachWindow}, based on peak issuance month ${selectedMetrics.peakMonthName}.`,
    ],
    [
      "Operational Planning",
      `Peak issuance month: ${selectedMetrics.peakMonthName} for student-support workload planning.`,
    ],
    [
      "Market Momentum",
      `Latest 12 months versus preceding 12 months: ${metricPct(selectedMetrics.latest12Change)}.`,
    ],
    ["Recovery Status", recoveryStatus],
    [
      "Concentration Risk",
      topOneShare !== null && topThreeShare !== null
        ? `Top post share: ${share(topOneShare)} · top three share: ${share(topThreeShare)} · ${concentrationLabel(topOneShare)} concentration.`
        : "N/A",
    ],
    ["Monitoring Signal", monitoring],
  ];

  /* ---- Filtered source rows ---- */
  const filteredRows = [...selected].sort(
    (a, b) =>
      b.monthIndex - a.monthIndex ||
      (a.post < b.post ? -1 : a.post > b.post ? 1 : 0) ||
      (a.visa < b.visa ? -1 : 1),
  );

  const monthStamp = (index: number) =>
    `${Math.floor(index / 12)}${String((index % 12) + 1).padStart(2, "0")}`;
  const countrySlug = country.toLowerCase().replace(/ /g, "_");
  const postSlug = post.toLowerCase().replace(/ /g, "_").replace(/\//g, "_");

  return (
    <div className="space-y-6">
      {header}

      <KpiRow>
        <KpiCard accent="gold" label="Total F1 Issuances" value={metricNumber(totalF1)} />
        <KpiCard accent="navy" label="Total J1 Issuances" value={metricNumber(totalJ1)} />
        <KpiCard
          accent="gold"
          label="Latest Month F1"
          value={metricNumber(latestF1)}
          delta={monthDisplay(latestIndex)}
        />
        <KpiCard
          accent="navy"
          label="Latest Month J1"
          value={metricNumber(latestJ1)}
          delta={monthDisplay(latestIndex)}
        />
        <KpiCard
          label="Peak F1 Month"
          value={monthDisplay(peakF1Month)}
          valueClassName="!text-[18px]"
          delta={peakF1Value !== null ? `${int(peakF1Value)} issuances` : undefined}
        />
        <KpiCard
          label="Peak J1 Month"
          value={monthDisplay(peakJ1Month)}
          valueClassName="!text-[18px]"
          delta={peakJ1Value !== null ? `${int(peakJ1Value)} issuances` : undefined}
        />
        <KpiCard accent="gold" label="Average Monthly F1" value={metricDecimal(avgF1)} />
        <KpiCard accent="navy" label="Average Monthly J1" value={metricDecimal(avgJ1)} />
        <KpiCard label="Active Months" value={metricNumber(activeMonths)} />
        <KpiCard
          accent="navy"
          label="Coverage Completeness"
          value={coverageCompleteness.main}
          valueClassName="!text-[18px]"
          delta={coverageCompleteness.detail}
        />
      </KpiRow>

      <Panel accent="navy">
        <h4 className="mb-2.5 text-base font-bold text-[#93C5FD]">
          Admissions Intelligence Summary
        </h4>
        <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-[#DDEBFA]">
          {insights.slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>

      <Chart data={monthlyTrace} layout={monthlyLayout} height={500} />
      <Caption>
        Method note: State Department publication format changed in October 2022; the metric
        definition remains monthly issuance by post and visa class.
      </Caption>

      <section>
        <SubHeading>Annual Aggregation</SubHeading>
        <MethodologyNote>2025 contains January-September only.</MethodologyNote>
        <RadioGroup
          label="Annual View"
          value={effectiveAnnualMode}
          options={["Calendar-year totals", "Comparable Jan-Sep totals"]}
          onChange={setAnnualMode}
        />
        <Chart data={annualTraces} layout={annualLayout} height={440} />
      </section>

      <section>
        <SubHeading>Seasonality</SubHeading>
        <Select
          label="Seasonality Statistic"
          value={seasonalityStat}
          options={SEASONALITY_STATS}
          onChange={(value) => setSeasonalityStat(value as SeasonalityStat)}
        />
        <Caption>
          {peakConcentration !== null
            ? `Peak calendar month: ${peakMonthLabel}. Peak-season concentration: ${peakConcentration.toFixed(1)}% of modeled month volume. Recommended outreach window: ${outreachWindow}. Directional recruitment-planning signal only.`
            : "Peak calendar month and recruitment window are N/A for this selection."}
        </Caption>
        <Chart data={seasonalityTraces} layout={seasonalityLayout} height={410} />
      </section>

      <section>
        <SubHeading>Consulate Comparison</SubHeading>
        <Select
          label="Sort Posts By"
          value={sortOption}
          options={SORT_OPTIONS}
          onChange={(value) => setSortOption(value as SortOption)}
        />

        <div className="my-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Strongest Current Post" value={strongestPost} valueClassName="!text-[16px]" />
          <KpiCard label="Fastest-Growing Post" value={fastestPost} valueClassName="!text-[16px]" />
          <KpiCard label="Most Seasonal Post" value={seasonalPost} valueClassName="!text-[16px]" />
          <KpiCard label="Highest Concentration" value={concentrationPost} valueClassName="!text-[16px]" />
        </div>

        <DataTable
          rows={comparisonTable.slice(0, 20)}
          height={390}
          rowKey={(row) => row.post}
          columns={[
            { key: "post", header: "Post", render: (r) => r.post },
            { key: "total", header: "Full-Period Total", numeric: true, render: (r) => metricNumber(r.total) },
            { key: "latest12", header: "Latest 12-Month Total", numeric: true, render: (r) => metricNumber(r.latest12) },
            { key: "share", header: "Share of Country Issuance", numeric: true, render: (r) => share(r.shareOfCountry) },
            { key: "baseline", header: "2019 Baseline", numeric: true, render: (r) => metricNumber(r.baseline2019) },
            {
              key: "recovery",
              header: "Latest Comparable Recovery Index",
              numeric: true,
              render: (r) => (notNa(r.recoveryIndex) ? r.recoveryIndex.toFixed(0) : "N/A"),
            },
            { key: "peak", header: "Peak Month", render: (r) => r.peakMonthName },
            { key: "volatility", header: "Volatility", render: (r) => r.volatility },
            { key: "seasonality", header: "Seasonality Strength", render: (r) => r.seasonalityStrength },
            { key: "growth", header: "Growth", numeric: true, render: (r) => metricPct(r.latest12Change) },
          ]}
        />
        <DownloadCsvButton
          label="Download Consulate Comparison CSV"
          filename={`qu_consulate_comparison_${countrySlug}_${monthStamp(startIndex)}_${monthStamp(endIndex)}.csv`}
          headers={[
            "Post", "Full-Period Total", "Latest 12-Month Total", "Share of Country Issuance",
            "2019 Baseline", "Latest Comparable Recovery Index", "Peak Month", "Volatility",
            "Volatility CV", "Seasonality Strength", "Seasonality Ratio", "Growth",
          ]}
          rows={comparisonTable.map((r) => [
            r.post,
            String(r.total),
            String(r.latest12),
            r.shareOfCountry === null ? "" : String(r.shareOfCountry),
            r.baseline2019 === null ? "" : String(r.baseline2019),
            r.recoveryIndex === null ? "" : String(r.recoveryIndex),
            r.peakMonthName,
            r.volatility,
            r.volatilityCv === null ? "" : String(r.volatilityCv),
            r.seasonalityStrength,
            r.seasonalityRatio === null ? "" : String(r.seasonalityRatio),
            r.latest12Change === null ? "" : String(r.latest12Change),
          ])}
        />

        {compareTraces.length > 0 ? (
          <div className="mt-4">
            <Chart
              data={compareTraces}
              layout={{
                height: 430,
                title: { text: `Selected Consulate Comparison - ${country}` },
                hovermode: "x unified",
                xaxis: { title: { text: "Month" } },
                yaxis: { title: { text: "Issuances" } },
                legend: { title: { text: "Consulate" } },
              }}
              height={430}
            />
          </div>
        ) : (
          <InfoCallout>Select at least one comparison post to show the comparison trend.</InfoCallout>
        )}
      </section>

      <section>
        <SubHeading>Pandemic Recovery Index</SubHeading>
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={recoveryVisibleOnly}
            onChange={(e) => setRecoveryVisibleOnly(e.target.checked)}
            className="accent-[#FFB81C]"
          />
          Calculate from visible range
        </label>
        {recoveryRows.length > 0 ? (
          <Chart data={recoveryTraces} layout={recoveryLayout} height={410} />
        ) : (
          <Panel accent="gold">
            <h4 className="mb-2 font-bold text-[#FFDF87]">Recovery Index: Not Available</h4>
            <p className="leading-relaxed text-[#DDEBFA]">
              Reason:{" "}
              {recoveryReasons.length > 0
                ? recoveryReasons.join("; ")
                : "insufficient comparable months"}
              .
            </p>
          </Panel>
        )}
      </section>

      <section>
        <SubHeading>How Admissions Can Use This</SubHeading>
        <Panel accent="gold">
          <div className="text-[22px] font-extrabold text-white">How Admissions Can Use This</div>
          <dl className="mt-3.5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {admissionsCards.map(([title, body]) => (
              <div key={title} className="rounded-md border border-slate-400/15 bg-white/[0.03] p-3">
                <dt className="text-[10px] font-extrabold uppercase tracking-wider text-[#93a4ba]">
                  {title}
                </dt>
                <dd className="mt-1 text-[13px] leading-snug text-white">{body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-[#DDEBFA]">
            Visa issuance volume is a directional student-mobility and consular-workload signal. It
            does not measure Quinnipiac applications, admits, deposits, enrollments, or individual
            visa approval probability.
          </p>
        </Panel>
      </section>

      <section>
        <SubHeading>Filtered Source Rows</SubHeading>
        {filteredRows.length > 1000 && (
          <Caption>
            Showing the first 1,000 of {int(filteredRows.length)} filtered rows. The CSV download
            includes all filtered rows.
          </Caption>
        )}
        <DataTable
          rows={filteredRows.slice(0, 1000)}
          height={360}
          rowKey={(row, index) => `${row.monthIndex}-${row.post}-${row.visa}-${index}`}
          columns={[
            { key: "month", header: "Month", render: (r) => `${r.year}-${String(r.month).padStart(2, "0")}` },
            { key: "country", header: "Country", render: (r) => r.country },
            { key: "postRaw", header: "Source Post Name", render: (r) => r.postRaw },
            { key: "post", header: "Canonical Post", render: (r) => r.post },
            { key: "visa", header: "Visa Class", render: (r) => r.visa },
            { key: "issuances", header: "Issuances", numeric: true, render: (r) => int(r.issuances) },
            { key: "era", header: "Source Era", render: (r) => r.sourceFormat },
            { key: "file", header: "Source File", render: (r) => r.sourceFile },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <DownloadCsvButton
            label="Download Filtered Historical Consulate CSV"
            filename={`qu_historical_consulate_${countrySlug}_${postSlug}_${monthStamp(startIndex)}_${monthStamp(endIndex)}.csv`}
            headers={[
              "Month", "Country", "Source Post Name", "Canonical Post", "Visa Class",
              "Issuances", "Source Era", "Source File",
            ]}
            rows={filteredRows.map((r) => [
              `${r.year}-${String(r.month).padStart(2, "0")}`,
              r.country, r.postRaw, r.post, r.visa, String(r.issuances), r.sourceFormat, r.sourceFile,
            ])}
          />
          <DownloadCsvButton
            label="Download Admissions Summary CSV"
            filename={`qu_admissions_summary_${countrySlug}_${postSlug}.csv`}
            headers={[
              "post", "country", "total_f1", "total_j1", "latest_12_months", "peak_month",
              "seasonality_strength", "seasonality_ratio", "recovery_index", "share_of_country",
              "volatility", "volatility_cv",
            ]}
            rows={[[
              post,
              country,
              totalF1 === null ? "" : String(totalF1),
              totalJ1 === null ? "" : String(totalJ1),
              String(selectedMetrics.latest12),
              selectedMetrics.peakMonthName,
              selectedMetrics.seasonalityStrength,
              selectedMetrics.seasonalityRatio === null ? "" : String(selectedMetrics.seasonalityRatio),
              selectedMetrics.recoveryIndex === null ? "" : String(selectedMetrics.recoveryIndex),
              selectedShare === null ? "" : String(selectedShare),
              selectedMetrics.volatility,
              selectedMetrics.volatilityCv === null ? "" : String(selectedMetrics.volatilityCv),
            ]]}
          />
        </div>
      </section>

      <Expander title="Data Source and Validation">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Source: U.S. Department of State Monthly NIV Issuance Reports</li>
          <li>Coverage: March 2017-September 2025</li>
          <li>Validated rows: 40,175</li>
          <li>F1 total: 3,037,511</li>
          <li>J1 total: 2,417,151</li>
          <li>Months validated: 103/103</li>
          <li>PDF era: March 2017-September 2022</li>
          <li>Excel era: October 2022-September 2025</li>
          <li>Missing months: 0</li>
          <li>Unmapped rows: 0</li>
          <li>Duplicate canonical post/visa rows: 0</li>
          <li>Raw PDF reconciliation completed</li>
          <li>PDF and Excel totals preserved</li>
          <li>Post-name harmonization completed</li>
          <li>2025 is partial through September</li>
          <li>
            Candidate file:{" "}
            <code className="font-mono">monthly_by_post_f1_j1_2017_2025_candidate.csv</code>
          </li>
          <li>
            This dashboard does not describe the data as real-time and does not claim automatic
            updates.
          </li>
        </ul>
      </Expander>
    </div>
  );
}

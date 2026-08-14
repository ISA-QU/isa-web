"use client";

import { useMemo, useState } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES, VISA_COLORS } from "../../../lib/dashboard/constants";
import {
  compactMonthRange,
  decimals,
  int,
  metricDecimal,
  metricNumber,
  metricPct,
  monthDisplay,
  share,
} from "../../../lib/dashboard/format";
import {
  concentrationLabel,
  fiscalYearGrowth,
  groupMean,
  groupMedian,
  groupSum,
  marketCategory,
  notNa,
  pctGrowth,
  postPeriodMetrics,
  recommendationProfile,
  recommendedAction,
  recommendedOutreachWindow,
  secondaryFlags,
  selectedVisaClasses,
  sumBy,
  historicalCountryName,
  monthlyCountryName,
  regionForCountry,
} from "../../../lib/dashboard/metrics";
import type { CommandCenterRow, VisaSelection } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import { useDashboard } from "../DashboardContext";
import {
  Caption,
  DataScopeNotice,
  DownloadCsvButton,
  InfoCallout,
  MethodologyExpanders,
  SubHeading,
} from "../shared";
import {
  DataTable,
  Expander,
  Field,
  KpiCard,
  KpiRow,
  MethodologyNote,
  MultiSelect,
  Panel,
  RadioGroup,
  Select,
  SectionTitle,
} from "../ui";

const RECENT_MODES = [
  "Latest 12 Months",
  "Latest 24 Months",
  "Jan 2023-Sep 2025",
  "Custom",
] as const;
type RecentMode = (typeof RECENT_MODES)[number];

const JAN_2023 = 2023 * 12; // monthIndex for January 2023

export default function Country360Tab() {
  const { data, countries } = useDashboard();

  const countryOptions = useMemo(
    () =>
      [
        ...new Set([
          ...countries,
          ...data.annualCountry.map((r) => r.country),
          ...data.postsMonthly.map((r) => r.country),
        ]),
      ].sort(),
    [countries, data.annualCountry, data.postsMonthly],
  );

  const [country, setCountry] = useState(() =>
    countryOptions.includes("India") ? "India" : (countryOptions[0] ?? ""),
  );
  const [visa, setVisa] = useState<VisaSelection>("Both");
  const [recentMode, setRecentMode] = useState<RecentMode>("Jan 2023-Sep 2025");
  const [histStart, setHistStart] = useState(1997);
  const [histEnd, setHistEnd] = useState(2024);
  // Rendered by the original but never read by any downstream calculation.
  const [comparableMode, setComparableMode] = useState<"Calendar Year" | "Jan-Sep Comparable">(
    "Calendar Year",
  );
  const [customStart, setCustomStart] = useState<number | null>(null);
  const [customEnd, setCustomEnd] = useState<number | null>(null);
  const [comparePosts, setComparePosts] = useState<string[] | null>(null);

  const visaClasses = selectedVisaClasses(visa);
  const monthCountry = monthlyCountryName(country);
  const histCountry = historicalCountryName(country);

  const opCountryAll = useMemo(
    () => data.operational.filter((r) => r.country === monthCountry),
    [data.operational, monthCountry],
  );
  const opCountry = useMemo(
    () => opCountryAll.filter((r) => visaClasses.includes(r.visa)),
    [opCountryAll, visaClasses],
  );
  const histCountryAll = useMemo(
    () => data.annualCountry.filter((r) => r.country === histCountry),
    [data.annualCountry, histCountry],
  );
  const hcCountryAll = useMemo(
    () => data.postsMonthly.filter((r) => r.country === monthCountry),
    [data.postsMonthly, monthCountry],
  );
  const hcCountry = useMemo(
    () => hcCountryAll.filter((r) => visaClasses.includes(r.visa)),
    [hcCountryAll, visaClasses],
  );

  const opMonthOptions = useMemo(
    () => [...new Set(opCountryAll.map((r) => r.year * 12 + (r.month - 1)))].sort((a, b) => a - b),
    [opCountryAll],
  );

  /* ---- Operational range, per the selected timeframe mode ---- */
  const [recentStart, recentEnd] = useMemo((): [number, number] => {
    if (opMonthOptions.length === 0) return [JAN_2023, 2025 * 12 + 8];
    const latest = opMonthOptions[opMonthOptions.length - 1];
    if (recentMode === "Custom") {
      return [customStart ?? opMonthOptions[0], customEnd ?? latest];
    }
    if (recentMode === "Latest 12 Months") return [latest - 11, latest];
    if (recentMode === "Latest 24 Months") return [latest - 23, latest];
    return [JAN_2023, latest];
  }, [opMonthOptions, recentMode, customStart, customEnd]);

  const opPeriod = useMemo(
    () =>
      opCountry.filter((r) => {
        const index = r.year * 12 + (r.month - 1);
        return index >= recentStart && index <= recentEnd;
      }),
    [opCountry, recentStart, recentEnd],
  );

  /* ---- Consulate comparison defaults: top five posts by F1 volume ---- */
  const postOptions = useMemo(
    () => [...new Set(hcCountryAll.map((r) => r.post))].sort(),
    [hcCountryAll],
  );
  const defaultComparePosts = useMemo(() => {
    const totals = groupSum(
      hcCountryAll.filter((r) => r.visa === "F1"),
      (r) => r.post,
      (r) => r.issuances,
    );
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([post]) => post);
    return (ranked.length > 0 ? ranked : postOptions).slice(0, 5);
  }, [hcCountryAll, postOptions]);

  const selectedPosts = comparePosts ?? defaultComparePosts;

  const empty =
    opCountryAll.length === 0 && histCountryAll.length === 0 && hcCountryAll.length === 0;

  /* ---- Headline metrics ---- */
  const metrics = useMemo(() => {
    const opF1Total = sumBy(opCountryAll.filter((r) => r.visa === "F1"), (r) => r.issuances);
    const opJ1Total = sumBy(opCountryAll.filter((r) => r.visa === "J1"), (r) => r.issuances);
    const fy2024F1 = sumBy(
      histCountryAll.filter((r) => r.fiscalYear === 2024 && r.visa === "F1"),
      (r) => r.issuances,
    );
    const fy2024J1 = sumBy(
      histCountryAll.filter((r) => r.fiscalYear === 2024 && r.visa === "J1"),
      (r) => r.issuances,
    );
    const growth5 =
      histCountryAll.length > 0 ? fiscalYearGrowth(histCountryAll, ["F1"], 2024, 2019) : null;
    const growth10 =
      histCountryAll.length > 0 ? fiscalYearGrowth(histCountryAll, ["F1"], 2024, 2014) : null;

    const latestHcIndex =
      hcCountry.length > 0 ? Math.max(...hcCountry.map((r) => r.monthIndex)) : null;
    const latest12Start = latestHcIndex !== null ? latestHcIndex - 11 : null;
    const latest12Hc =
      latest12Start !== null ? hcCountry.filter((r) => r.monthIndex >= latest12Start) : [];

    const latest12F1 = visaClasses.includes("F1")
      ? sumBy(latest12Hc.filter((r) => r.visa === "F1"), (r) => r.issuances)
      : null;
    const latest12J1 = visaClasses.includes("J1")
      ? sumBy(latest12Hc.filter((r) => r.visa === "J1"), (r) => r.issuances)
      : null;

    const hcMetrics = postPeriodMetrics(hcCountry);
    const postTotals = [...groupSum(hcCountry, (r) => r.post, (r) => r.issuances).entries()].sort(
      (a, b) => b[1] - a[1],
    );
    const hcTotal = postTotals.reduce((total, [, value]) => total + value, 0);
    const topOneShare = hcTotal ? postTotals.slice(0, 1).reduce((t, [, v]) => t + v, 0) / hcTotal : null;
    const topThreeShare = hcTotal ? postTotals.slice(0, 3).reduce((t, [, v]) => t + v, 0) / hcTotal : null;
    const topConsulate = postTotals.length > 0 ? postTotals[0][0] : "N/A";
    const dataConfidence =
      hcCountryAll.length > 0 && histCountryAll.length > 0 && opCountryAll.length > 0
        ? "High"
        : "Partial";

    // Assembled to match the shape the shared classifiers expect.
    const decision = {
      country,
      region: regionForCountry(country),
      currentVolume: opF1Total,
      growth5yr: growth5,
      growth10yr: growth10,
      cagr10yr: null,
      latest12Total: sumBy(latest12Hc, (r) => r.issuances),
      prior12Total: 0,
      latest12Momentum: hcMetrics.latest12Change,
      recoveryIndex: hcMetrics.recoveryIndex,
      peakMonth: hcMetrics.peakMonth,
      peakMonthName: hcMetrics.peakMonthName,
      seasonalityRatio: hcMetrics.seasonalityRatio,
      volatilityCv: hcMetrics.volatilityCv,
      topOneShare,
      topThreeShare,
      concentrationRisk: concentrationLabel(topOneShare),
    } satisfies Omit<
      CommandCenterRow,
      | "marketCategory" | "secondaryFlags" | "secondaryFlagsText" | "confidence"
      | "recommendedAction" | "primaryDriver" | "counterSignal" | "timing" | "caveat" | "evidence"
    >;

    const category = marketCategory(decision);
    const flags = secondaryFlags({ ...decision, marketCategory: category });
    const confidence =
      dataConfidence === "High" && !flags.includes("Low Confidence") ? "High" : dataConfidence;
    const action = recommendedAction({
      ...decision,
      marketCategory: category,
      secondaryFlags: flags,
    });
    const profile = recommendationProfile({
      ...decision,
      recommendedAction: action,
      confidence,
    });

    return {
      opF1Total, opJ1Total, fy2024F1, fy2024J1, growth5, growth10,
      latest12Hc, latest12F1, latest12J1, hcMetrics,
      topOneShare, topThreeShare, topConsulate, dataConfidence,
      category, flags, confidence, action, profile,
    };
  }, [opCountryAll, histCountryAll, hcCountry, hcCountryAll, visaClasses, country]);

  const momentum = metrics.hcMetrics.latest12Change;
  const momentumLabel = !notNa(momentum)
    ? "N/A"
    : momentum <= -20
      ? "Weak"
      : momentum >= 15
        ? "Strong"
        : "Stable";

  const keyRiskParts: string[] = [];
  if (metrics.flags.includes("High Concentration") && metrics.topThreeShare !== null) {
    keyRiskParts.push(`top-three post concentration ${share(metrics.topThreeShare)}`);
  }
  if (metrics.flags.includes("Volatile") && metrics.hcMetrics.volatilityCv !== null) {
    keyRiskParts.push(`volatility CV ${metrics.hcMetrics.volatilityCv.toFixed(2)}`);
  }
  if (metrics.flags.includes("Weak Recent Momentum") && momentum !== null) {
    keyRiskParts.push(`recent momentum ${metricPct(momentum)}`);
  }
  const keyRisk =
    keyRiskParts.length > 0 ? keyRiskParts.join(" and ") : "No high-threshold risk flag triggered";

  /* ---- Charts ---- */
  const opTrend = useMemo(() => {
    const byMonthVisa = groupSum(
      opPeriod,
      (r) => `${r.year * 12 + (r.month - 1)}|${r.visa}`,
      (r) => r.issuances,
    );
    const visas = [...new Set(opPeriod.map((r) => r.visa))].sort();
    const traces: Trace[] = visas.map((visaClass) => {
      const points = [...byMonthVisa.entries()]
        .filter(([key]) => key.endsWith(`|${visaClass}`))
        .map(([key, value]) => ({ index: Number(key.split("|")[0]), value }))
        .sort((a, b) => a.index - b.index);
      return {
        type: "scatter",
        mode: "lines+markers",
        name: visaClass,
        x: points.map((p) => monthDisplay(p.index)),
        y: points.map((p) => p.value),
        line: { color: VISA_COLORS[visaClass] },
        marker: { color: VISA_COLORS[visaClass] },
      } as Trace;
    });
    const layout: ChartLayout = {
      height: 410,
      title: { text: `Recent Operational Monthly Trend - ${country}` },
      hovermode: "x unified",
      xaxis: { title: { text: "Month" } },
      yaxis: { title: { text: "Issuances" } },
    };
    return { data: traces, layout };
  }, [opPeriod, country]);

  const currentPosts = useMemo(
    () =>
      [...groupSum(opPeriod, (r) => r.post, (r) => r.issuances).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([post, issuances]) => ({ post, issuances })),
    [opPeriod],
  );

  const histRange = useMemo(
    () => histCountryAll.filter((r) => r.fiscalYear >= histStart && r.fiscalYear <= histEnd),
    [histCountryAll, histStart, histEnd],
  );

  const histChart = useMemo(() => {
    const byYear = new Map<number, { F1: number; J1: number }>();
    for (const row of histRange) {
      const entry = byYear.get(row.fiscalYear) ?? { F1: 0, J1: 0 };
      entry[row.visa] += row.issuances;
      byYear.set(row.fiscalYear, entry);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const traces: Trace[] = (["F1", "J1"] as const).map((visaClass) => ({
      type: "scatter",
      mode: "lines+markers",
      name: visaClass,
      x: years,
      y: years.map((year) => byYear.get(year)![visaClass]),
      line: { color: VISA_COLORS[visaClass] },
      marker: { color: VISA_COLORS[visaClass] },
    })) as Trace[];

    const layout: ChartLayout = {
      height: 460,
      title: {
        text: `FY${histStart}-FY${histEnd} Annual Country/Nationality Trend - ${histCountry}`,
      },
      hovermode: "x unified",
      xaxis: { title: { text: "Fiscal Year" } },
      yaxis: { title: { text: "Issuances" } },
      shapes:
        histStart <= 2020 && 2020 <= histEnd
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
          : [],
      annotations:
        histStart <= 2020 && 2020 <= histEnd
          ? [
              {
                x: 2020,
                y: 1,
                yref: "paper",
                text: "2020 disruption",
                showarrow: false,
                font: { color: "#FCA5A5", size: 11 },
              },
            ]
          : [],
    } as ChartLayout;

    return { data: traces, layout, hasRows: histRange.length > 0 };
  }, [histRange, histStart, histEnd, histCountry]);

  const networkChart = useMemo(() => {
    const byMonthVisa = groupSum(hcCountry, (r) => `${r.monthIndex}|${r.visa}`, (r) => r.issuances);
    const visas = [...new Set(hcCountry.map((r) => r.visa))].sort();
    const traces: Trace[] = visas.map((visaClass) => {
      const points = [...byMonthVisa.entries()]
        .filter(([key]) => key.endsWith(`|${visaClass}`))
        .map(([key, value]) => ({ index: Number(key.split("|")[0]), value }))
        .sort((a, b) => a.index - b.index);
      return {
        type: "scatter",
        mode: "lines",
        name: visaClass,
        x: points.map((p) => monthDisplay(p.index)),
        y: points.map((p) => p.value),
        line: { color: VISA_COLORS[visaClass] },
      } as Trace;
    });
    const layout: ChartLayout = {
      height: 440,
      title: { text: `Monthly Consulate Network Trend - ${monthCountry}` },
      hovermode: "x unified",
      xaxis: { title: { text: "Month" } },
      yaxis: { title: { text: "Issuances" } },
    };
    return { data: traces, layout };
  }, [hcCountry, monthCountry]);

  const compareChart = useMemo(() => {
    const rows = hcCountry.filter((r) => selectedPosts.includes(r.post));
    const byMonthPost = groupSum(rows, (r) => `${r.monthIndex}|${r.post}`, (r) => r.issuances);
    const traces: Trace[] = selectedPosts.map((post) => {
      const points = [...byMonthPost.entries()]
        .filter(([key]) => key.slice(key.indexOf("|") + 1) === post)
        .map(([key, value]) => ({ index: Number(key.split("|")[0]), value }))
        .sort((a, b) => a.index - b.index);
      return {
        type: "scatter",
        mode: "lines",
        name: post,
        x: points.map((p) => monthDisplay(p.index)),
        y: points.map((p) => p.value),
      } as Trace;
    });
    const layout: ChartLayout = {
      height: 420,
      title: { text: "Selected Consulate Comparison" },
      hovermode: "x unified",
      xaxis: { title: { text: "Month" } },
      yaxis: { title: { text: "Issuances" } },
    };
    return { data: traces, layout };
  }, [hcCountry, selectedPosts]);

  const recovery = useMemo(() => {
    const rows: Array<{ period: string; index: number }> = [];
    if (hcCountry.length > 0) {
      const baseline = sumBy(hcCountry.filter((r) => r.year === 2019), (r) => r.issuances);
      for (const year of [2019, 2020, 2021, 2022, 2023, 2024]) {
        const value = sumBy(hcCountry.filter((r) => r.year === year), (r) => r.issuances);
        if (baseline > 0) rows.push({ period: String(year), index: (value / baseline) * 100 });
      }
      const baselineJanSep = sumBy(
        hcCountry.filter((r) => r.year === 2019 && r.month <= 9),
        (r) => r.issuances,
      );
      const value2025 = sumBy(
        hcCountry.filter((r) => r.year === 2025 && r.month <= 9),
        (r) => r.issuances,
      );
      if (baselineJanSep > 0) {
        rows.push({ period: "2025 Jan-Sep", index: (value2025 / baselineJanSep) * 100 });
      }
    }

    const data: Trace[] = [
      {
        type: "scatter",
        mode: "lines+markers",
        x: rows.map((r) => r.period),
        y: rows.map((r) => r.index),
        line: { color: "#3D8DDE" },
        marker: { color: "#3D8DDE" },
        name: "Recovery Index",
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 390,
      title: { text: "Country Recovery Index: 2019 = 100" },
      yaxis: { title: { text: "Recovery Index" } },
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
    } as ChartLayout;

    return { data, layout, rows };
  }, [hcCountry]);

  const seasonality = useMemo(() => {
    const avg = groupMean(hcCountry, (r) => r.month, (r) => r.issuances);
    const med = groupMedian(hcCountry, (r) => r.month, (r) => r.issuances);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const rows = months.map((month) => ({
      month: MONTH_NAMES[month],
      calendarMonth: month,
      average: avg.get(month) ?? 0,
      median: med.get(month) ?? 0,
    }));

    const data: Trace[] = [
      {
        type: "bar",
        name: "Average",
        x: rows.map((r) => r.month),
        y: rows.map((r) => r.average),
        marker: { color: "#FFB81C" },
      },
      {
        type: "bar",
        name: "Median",
        x: rows.map((r) => r.month),
        y: rows.map((r) => r.median),
        marker: { color: "#3D8DDE" },
      },
    ];
    const layout: ChartLayout = {
      height: 420,
      barmode: "group",
      title: { text: `Average and Median Calendar-Month Issuance - ${country}` },
      xaxis: { title: { text: "Calendar Month" }, categoryorder: "array", categoryarray: rows.map((r) => r.month) },
    };
    return { data, layout, rows };
  }, [hcCountry, country]);

  const janSep2025 = sumBy(
    opCountry.filter((r) => r.year === 2025 && r.month <= 9),
    (r) => r.issuances,
  );
  const janSep2024 = sumBy(
    opCountry.filter((r) => r.year === 2024 && r.month <= 9),
    (r) => r.issuances,
  );

  const slug = country.toLowerCase().replace(/ /g, "_");

  const actionCards: Array<[string, string, string, string]> = [
    [metrics.action, metrics.profile.primaryDriver, metrics.profile.timing, metrics.profile.caveat],
  ];
  if (metrics.flags.includes("Highly Seasonal")) {
    actionCards.push([
      "Begin Outreach Earlier",
      `Peak issuance month is ${metrics.hcMetrics.peakMonthName} with ${decimals(metrics.hcMetrics.seasonalityRatio, 1)}x average-month strength.`,
      recommendedOutreachWindow(metrics.hcMetrics.peakMonth),
      "Issuance timing is a mobility signal, not demand proof.",
    ]);
  }
  if (metrics.flags.includes("High Concentration")) {
    actionCards.push([
      "Monitor Specific Consulate",
      `${metrics.topConsulate} accounts for ${share(metrics.topOneShare)} of historical volume.`,
      "Monthly monitoring",
      "Concentration can create operational exposure.",
    ]);
  }
  if (metrics.flags.includes("Volatile")) {
    actionCards.push([
      "Prepare for Peak Support Workload",
      `Monthly volatility CV is ${decimals(metrics.hcMetrics.volatilityCv, 2)}.`,
      `Before ${metrics.hcMetrics.peakMonthName} peak`,
      "Use as workload planning, not individual approval prediction.",
    ]);
  }

  const summaryBullets: string[] = [];
  if (metrics.opF1Total) {
    summaryBullets.push(
      `${country}'s operational F1 total is ${int(metrics.opF1Total)} across January 2023-September 2025.`,
    );
  }
  if (metrics.growth10 !== null) {
    summaryBullets.push(`FY2024 F1 issuance is ${metricPct(metrics.growth10)} versus FY2014.`);
  }
  if (metrics.hcMetrics.latest12Change !== null) {
    summaryBullets.push(
      `Latest 12-month consulate momentum is ${metricPct(metrics.hcMetrics.latest12Change)} versus the prior 12 months.`,
    );
  }
  if (metrics.topConsulate !== "N/A" && metrics.topOneShare !== null) {
    summaryBullets.push(
      `${metrics.topConsulate} is the leading historical consulate with ${share(metrics.topOneShare)} of selected visa-class volume.`,
    );
  }
  if (metrics.hcMetrics.peakMonthName !== "N/A") {
    summaryBullets.push(
      `Peak recruitment-planning month is ${metrics.hcMetrics.peakMonthName} based on average monthly issuance.`,
    );
  }
  if (summaryBullets.length === 0) {
    summaryBullets.push("Comparable evidence is limited for this country in the current filters.");
  }

  return (
    <div className="space-y-6">
      <SectionTitle>Country 360</SectionTitle>

      <Panel accent="navy">
        <h4 className="mb-2 text-base font-bold text-white">
          Current performance, long-term trajectory, consulate network, timing, and recommended
          admissions actions.
        </h4>
        <p className="text-sm leading-relaxed text-[#DDEBFA]">
          Country 360 combines the three validated intelligence layers without merging their
          different grains.
        </p>
      </Panel>

      <DataScopeNotice />
      <MethodologyExpanders includeMarket />

      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Country" value={country} options={countryOptions} onChange={setCountry} />
        <RadioGroup<VisaSelection>
          label="Visa Class"
          value={visa}
          options={["F1", "J1", "Both"]}
          onChange={setVisa}
        />
        <Select
          label="Recent Timeframe"
          value={recentMode}
          options={RECENT_MODES}
          onChange={(value) => setRecentMode(value as RecentMode)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Historical Year Range: FY${histStart} - FY${histEnd}`}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1997}
              max={2024}
              value={histStart}
              onChange={(e) => setHistStart(Math.min(Number(e.target.value), histEnd))}
              className="w-full accent-[#FFB81C]"
              aria-label="Historical range start"
            />
            <input
              type="range"
              min={1997}
              max={2024}
              value={histEnd}
              onChange={(e) => setHistEnd(Math.max(Number(e.target.value), histStart))}
              className="w-full accent-[#FFB81C]"
              aria-label="Historical range end"
            />
          </div>
        </Field>

        <RadioGroup
          label="Comparable Period Mode"
          value={comparableMode}
          options={["Calendar Year", "Jan-Sep Comparable"] as const}
          onChange={setComparableMode}
        />

        {recentMode === "Custom" && opMonthOptions.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Custom Range Start"
              value={monthDisplay(recentStart)}
              options={opMonthOptions.map(monthDisplay)}
              onChange={(value) =>
                setCustomStart(opMonthOptions.find((index) => monthDisplay(index) === value) ?? null)
              }
            />
            <Select
              label="Custom Range End"
              value={monthDisplay(recentEnd)}
              options={opMonthOptions.map(monthDisplay)}
              onChange={(value) =>
                setCustomEnd(opMonthOptions.find((index) => monthDisplay(index) === value) ?? null)
              }
            />
          </div>
        ) : opMonthOptions.length > 0 ? (
          <Panel className="!mb-0 !p-4">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#FFDF87]">
              Operational Range
            </div>
            <div className="mt-1 font-extrabold text-white">
              {compactMonthRange(recentStart, recentEnd)}
            </div>
          </Panel>
        ) : (
          <InfoCallout>No operational monthly records are available for this country.</InfoCallout>
        )}
      </div>

      <MultiSelect
        label="Compare Consulates"
        options={postOptions}
        values={selectedPosts}
        onChange={(values) => setComparePosts(values.slice(0, 5))}
      />

      {empty ? (
        <InfoCallout>
          No validated records are available for this country across the current data layers.
        </InfoCallout>
      ) : (
        <>
          <section>
            <SubHeading>Country Recommendation</SubHeading>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <KpiCard label="Strategic Status" value={`${metrics.category} Market`} valueClassName="!text-[16px]" />
              <KpiCard label="Current Momentum" value={momentumLabel} valueClassName="!text-[16px]" />
              <KpiCard label="Recommended Action" value={metrics.action} valueClassName="!text-[14px]" />
              <KpiCard label="Recruitment Timing" value={metrics.profile.timing} valueClassName="!text-[13px]" />
              <KpiCard label="Key Risk" value={keyRisk} valueClassName="!text-[13px]" />
              <KpiCard label="Confidence" value={metrics.confidence} valueClassName="!text-[16px]" />
            </div>
            <Caption>
              Primary driver: {metrics.profile.primaryDriver}. Counter-signal:{" "}
              {metrics.profile.counterSignal}. Caveat: {metrics.profile.caveat}
            </Caption>
          </section>

          <section>
            <SubHeading>What You Need to Know</SubHeading>
            <Panel accent="navy">
              <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-[#DDEBFA]">
                {summaryBullets.slice(0, 5).map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </Panel>
          </section>

          <section>
            <SubHeading>Primary KPIs</SubHeading>
            <KpiRow>
              <KpiCard accent="gold" label="Operational F1" value={metricNumber(metrics.opF1Total)} />
              <KpiCard accent="gold" label="FY2024 Annual F1" value={metricNumber(metrics.fy2024F1)} />
              <KpiCard label="10-Year F1 Growth" value={metricPct(metrics.growth10)} />
              <KpiCard
                label="Latest 12-Month Momentum"
                value={metricPct(metrics.hcMetrics.latest12Change)}
              />
              <KpiCard label="Recovery Index" value={metricDecimal(metrics.hcMetrics.recoveryIndex)} />
              <KpiCard accent="navy" label="Recommended Action" value={metrics.action} valueClassName="!text-[15px]" />
            </KpiRow>

            <Expander title="Secondary KPI Details">
              <KpiRow>
                <KpiCard accent="navy" label="Operational J1" value={metricNumber(metrics.opJ1Total)} />
                <KpiCard accent="navy" label="FY2024 Annual J1" value={metricNumber(metrics.fy2024J1)} />
                <KpiCard label="5-Year F1 Growth" value={metricPct(metrics.growth5)} />
                <KpiCard accent="gold" label="Latest 12-Month F1" value={metricNumber(metrics.latest12F1)} />
                <KpiCard accent="navy" label="Latest 12-Month J1" value={metricNumber(metrics.latest12J1)} />
                <KpiCard accent="gold" label="Peak Month" value={metrics.hcMetrics.peakMonthName} valueClassName="!text-[16px]" />
                <KpiCard label="Top Consulate" value={metrics.topConsulate} valueClassName="!text-[16px]" />
                <KpiCard label="Top-One Share" value={share(metrics.topOneShare)} />
                <KpiCard label="Top-Three Share" value={share(metrics.topThreeShare)} />
                <KpiCard accent="navy" label="Volatility" value={metrics.hcMetrics.volatility} valueClassName="!text-[16px]" />
                <KpiCard label="Confidence" value={metrics.confidence} valueClassName="!text-[16px]" />
              </KpiRow>
            </Expander>
          </section>

          <section>
            <SubHeading>Recommended Admissions Actions</SubHeading>
            <div className="grid gap-4 lg:grid-cols-3">
              {actionCards.slice(0, 6).map(([title, evidence, timing, caveat], index) => (
                <div
                  key={`${title}-${index}`}
                  className="rounded-lg border border-slate-400/20 bg-white/[0.03] p-4"
                >
                  <div className="font-bold text-white">{title}</div>
                  <p className="mt-2 text-xs text-slate-400">Evidence: {evidence}</p>
                  <p className="mt-1 text-xs text-slate-400">Timing: {timing}</p>
                  <p className="mt-1 text-xs text-slate-400">Caveat: {caveat}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SubHeading>Current Operational Signal</SubHeading>
            <MethodologyNote wide>
              Operational data currently covers January 2023 through September 2025.
            </MethodologyNote>
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              {opPeriod.length > 0 ? (
                <Chart data={opTrend.data} layout={opTrend.layout} height={410} />
              ) : (
                <InfoCallout>No operational rows match the selected recent timeframe.</InfoCallout>
              )}
              <DataTable
                rows={currentPosts}
                height={410}
                rowKey={(row) => row.post}
                columns={[
                  { key: "post", header: "Post", render: (r) => r.post },
                  { key: "issuances", header: "Issuances", numeric: true, render: (r) => int(r.issuances) },
                ]}
              />
            </div>
            <Caption>
              2025 Jan-Sep comparable volume: {int(janSep2025)}; 2024 Jan-Sep comparable volume:{" "}
              {int(janSep2024)}; change: {metricPct(pctGrowth(janSep2025, janSep2024))}.
            </Caption>
          </section>

          <section>
            <SubHeading>Long-Term Country Trajectory</SubHeading>
            <MethodologyNote wide>
              Annual country history currently ends at FY2024 because the official FY2025 annual
              detail table has not been published.
            </MethodologyNote>
            {histChart.hasRows ? (
              <Chart data={histChart.data} layout={histChart.layout} height={460} />
            ) : (
              <InfoCallout>
                No annual country history is available for the selected country label.
              </InfoCallout>
            )}
          </section>

          <section>
            <SubHeading>Historical Consulate Network</SubHeading>
            {hcCountry.length > 0 ? (
              <>
                <Chart data={networkChart.data} layout={networkChart.layout} height={440} />
                <Caption>
                  Method note: State Department publication format changed in October 2022; the
                  metric definition remains monthly issuance by post and visa class.
                </Caption>
                <div className="grid gap-4 lg:grid-cols-2">
                  <DataTable
                    rows={[...groupSum(hcCountry, (r) => r.post, (r) => r.issuances).entries()]
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 12)
                      .map(([post, issuances]) => ({ post, issuances }))}
                    height={360}
                    rowKey={(row) => row.post}
                    columns={[
                      { key: "post", header: "Consulate", render: (r) => r.post },
                      { key: "value", header: "Full-History Issuances", numeric: true, render: (r) => int(r.issuances) },
                    ]}
                  />
                  <DataTable
                    rows={[
                      ...groupSum(metrics.latest12Hc, (r) => r.post, (r) => r.issuances).entries(),
                    ]
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 12)
                      .map(([post, issuances]) => ({ post, issuances }))}
                    height={360}
                    rowKey={(row) => row.post}
                    columns={[
                      { key: "post", header: "Consulate", render: (r) => r.post },
                      { key: "value", header: "Latest 12-Month Issuances", numeric: true, render: (r) => int(r.issuances) },
                    ]}
                  />
                </div>
                {selectedPosts.length > 0 && (
                  <Chart data={compareChart.data} layout={compareChart.layout} height={420} />
                )}
              </>
            ) : (
              <InfoCallout>
                No historical consulate network data is available for this country.
              </InfoCallout>
            )}
          </section>

          <section>
            <SubHeading>Recovery</SubHeading>
            {recovery.rows.length > 0 ? (
              <Chart data={recovery.data} layout={recovery.layout} height={390} />
            ) : (
              <InfoCallout>
                Recovery index is N/A because this country has no positive 2019 baseline in the
                selected visa classes.
              </InfoCallout>
            )}
          </section>

          {hcCountry.length > 0 && (
            <section>
              <SubHeading>Seasonality and Recruitment Timing</SubHeading>
              <Chart data={seasonality.data} layout={seasonality.layout} height={420} />
              <Caption>
                Peak month: {metrics.hcMetrics.peakMonthName}; seasonality strength:{" "}
                {metrics.hcMetrics.seasonalityStrength}; recommended outreach window:{" "}
                {recommendedOutreachWindow(metrics.hcMetrics.peakMonth)}. Directional planning signal
                only.
              </Caption>
            </section>
          )}

          <section>
            <SubHeading>Momentum, Risk, and Concentration</SubHeading>
            <DataTable
              height={260}
              rowKey={(row) => row.metric}
              rows={[
                {
                  metric: "Top-one post share",
                  value: share(metrics.topOneShare),
                  interpretation: concentrationLabel(metrics.topOneShare),
                },
                {
                  metric: "Top-three post share",
                  value: share(metrics.topThreeShare),
                  interpretation: concentrationLabel(metrics.topThreeShare),
                },
                {
                  metric: "Monthly volatility CV",
                  value: decimals(metrics.hcMetrics.volatilityCv, 2),
                  interpretation: metrics.hcMetrics.volatility,
                },
                {
                  metric: "Latest 12-month momentum",
                  value: metricPct(metrics.hcMetrics.latest12Change),
                  interpretation: "Comparable 12-month change",
                },
                {
                  metric: "Seasonality ratio",
                  value: notNa(metrics.hcMetrics.seasonalityRatio)
                    ? `${metrics.hcMetrics.seasonalityRatio.toFixed(1)}x`
                    : "N/A",
                  interpretation: metrics.hcMetrics.seasonalityStrength,
                },
              ]}
              columns={[
                { key: "metric", header: "Metric", render: (r) => r.metric },
                { key: "value", header: "Value", numeric: true, render: (r) => r.value },
                { key: "interpretation", header: "Interpretation", render: (r) => r.interpretation },
              ]}
            />
            <Expander title="Threshold Definitions">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>High concentration: top post share &gt;= 50%; moderate concentration: &gt;= 30%.</li>
                <li>High volatility: monthly coefficient of variation &gt;= 0.85; moderate: &gt;= 0.45.</li>
                <li>High seasonality: peak-month average &gt;= 2.0x monthly mean; moderate: &gt;= 1.4x.</li>
                <li>
                  Momentum uses the latest 12 months versus the preceding 12 months in the validated
                  historical consulate layer.
                </li>
              </ul>
            </Expander>
          </section>

          <section>
            <SubHeading>Downloads</SubHeading>
            <div className="flex flex-wrap gap-2">
              <DownloadCsvButton
                label="Country 360 Summary CSV"
                filename={`qu_country360_summary_${slug}.csv`}
                headers={[
                  "country", "operational_f1_total", "operational_j1_total", "fy2024_f1", "fy2024_j1",
                  "f1_growth_5yr_pct", "f1_growth_10yr_pct", "top_consulate", "peak_month",
                  "recovery_index", "top_one_share", "top_three_share", "volatility", "data_confidence",
                ]}
                rows={[[
                  country,
                  String(metrics.opF1Total),
                  String(metrics.opJ1Total),
                  String(metrics.fy2024F1),
                  String(metrics.fy2024J1),
                  metrics.growth5 === null ? "" : String(metrics.growth5),
                  metrics.growth10 === null ? "" : String(metrics.growth10),
                  metrics.topConsulate,
                  metrics.hcMetrics.peakMonthName,
                  metrics.hcMetrics.recoveryIndex === null ? "" : String(metrics.hcMetrics.recoveryIndex),
                  metrics.topOneShare === null ? "" : String(metrics.topOneShare),
                  metrics.topThreeShare === null ? "" : String(metrics.topThreeShare),
                  metrics.hcMetrics.volatility,
                  metrics.dataConfidence,
                ]]}
              />
              <DownloadCsvButton
                label="Annual Country History CSV"
                filename={`qu_country360_annual_${slug}.csv`}
                headers={["fiscal_year", "country", "visa_class", "issuances"]}
                rows={histRange.map((r) => [
                  String(r.fiscalYear), r.country, r.visa, String(r.issuances),
                ])}
              />
              <DownloadCsvButton
                label="Historical Consulate Network CSV"
                filename={`qu_country360_consulate_${slug}.csv`}
                headers={["calendar_year", "calendar_month", "fiscal_year", "post_canonical", "country", "visa_class", "issuances"]}
                rows={hcCountry.map((r) => [
                  String(r.year), String(r.month), String(r.fiscalYear), r.post, r.country, r.visa, String(r.issuances),
                ])}
              />
              <DownloadCsvButton
                label="Recruitment Timing CSV"
                filename={`qu_country360_timing_${slug}.csv`}
                headers={["Month", "calendar_month", "Average", "Median"]}
                rows={
                  hcCountry.length > 0
                    ? seasonality.rows.map((r) => [
                        r.month, String(r.calendarMonth), String(r.average), String(r.median),
                      ])
                    : []
                }
              />
              <DownloadCsvButton
                label="Current Operational Country CSV"
                filename={`qu_country360_operational_${slug}.csv`}
                headers={["post", "visa_class", "issuances", "year", "month"]}
                rows={opPeriod.map((r) => [
                  r.post, r.visa, String(r.issuances), String(r.year), String(r.month),
                ])}
              />
            </div>
          </section>

          <section>
            <SubHeading>Data Scope and Trust</SubHeading>
            <Expander title="Methodology Details">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Operational layer: <code className="font-mono">{monthCountry}</code> monthly
                  country/post data from January 2023-September 2025.
                </li>
                <li>
                  Historical country layer: <code className="font-mono">{histCountry}</code> annual
                  country/nationality data from FY1997-FY2024.
                </li>
                <li>
                  Historical consulate layer: <code className="font-mono">{monthCountry}</code>{" "}
                  monthly canonical-post data from March 2017-September 2025.
                </li>
                <li>
                  Country label bridge: <code className="font-mono">{country}</code> maps to monthly
                  label <code className="font-mono">{monthCountry}</code> and annual label{" "}
                  <code className="font-mono">{histCountry}</code>.
                </li>
                <li>Annual totals and monthly post totals remain separate and are not added together.</li>
                <li>2025 is partial through September for monthly records.</li>
                <li>
                  Issuance volume is not individual visa approval probability and is not QU
                  enrollment data.
                </li>
              </ul>
            </Expander>
          </section>
        </>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES, MONTH_NAMES_FULL, VISA_COLORS } from "../../../lib/dashboard/constants";
import {
  decimals,
  int,
  metricNumber,
  metricPct,
  monthDisplay,
  monthLongDisplay,
  share,
  yearToDateLabel,
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
  latestCompleteYear,
  monthlyCountryName,
  regionForCountry,
  seasonalityCv,
} from "../../../lib/dashboard/metrics";
import { buildConsulateTable, recoveryYearOf } from "../../../lib/dashboard/consulates";
import { averagePerMonth, calendarMonthYearCounts } from "../../../lib/dashboard/periods";
import { arrowPct, monthRangeLabel, rollingTotals } from "../../../lib/dashboard/rolling";
import type { CommandCenterRow } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import ComparePicker from "../ComparePicker";
import { useDashboard, visaLabelOf } from "../DashboardContext";
import { useOpenTab } from "../TabNavigation";
import {
  Caption,
  DownloadCsvButton,
  InfoCallout,
  SubHeading,
} from "../shared";
import {
  DataTable,
  Expander,
  Field,
  KpiCard,
  KpiRow,
  MethodologyNote,
  FixedTag,
  Panel,
  SectionTitle,
} from "../ui";


export default function Country360Tab() {
  // The country is the dashboard-wide selection, shared with the sidebar and other tabs.
  // Country, visa and period come from the control bar.
  const {
    data,
    focusCountry: country,
    visa,
    visaLabel,
    periodRange,
    provisionalYears,
    compareCountries,
    setCompareCountries,
    f1Filtered,
    visaFiltered,
    focusRows,
    typical,
    consulateCountries,
    summary,
  } = useDashboard();
  const { coverage, fiscalYears } = data.meta;
  const operationalRange = coverage.operational;
  // Annual metrics use complete fiscal years; a year-to-date one would read as a collapse.
  const firstFy = coverage.annual.first ?? 1997;
  const latestFy = coverage.annual.latestComplete ?? firstFy;
  const endIndex = coverage.postsMonthly.end;
  const endYear = Math.floor(endIndex / 12);
  const throughMonth = (endIndex % 12) + 1;

  const [histStart, setHistStart] = useState(firstFy);
  const [histEnd, setHistEnd] = useState(latestFy);

  const visaClasses = selectedVisaClasses(visa);
  const monthCountry = monthlyCountryName(country);
  const histCountry = historicalCountryName(country);

  const opCountryAll = useMemo(
    () => data.operational.filter((r) => r.country === monthCountry),
    [data.operational, monthCountry],
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

  // "Current Operational Signal" follows the control bar's Period. It reads the
  // full monthly consulate data, so any period since Mar 2017 works.
  const opPeriod = useMemo(
    () =>
      hcCountry.filter(
        (r) => r.monthIndex >= periodRange.start && r.monthIndex <= periodRange.end,
      ),
    [hcCountry, periodRange],
  );

  // F1 and J1 for the control bar's Period (whatever the Visa), shown where the
  // old "Operational" (Jan 2024 – Feb 2026) figures were. The recommendation's
  // inputs are unchanged (they still use the operational window).
  const periodF1 = sumBy(
    hcCountryAll.filter(
      (r) => r.visa === "F1" && r.monthIndex >= periodRange.start && r.monthIndex <= periodRange.end,
    ),
    (r) => r.issuances,
  );
  const periodJ1 = sumBy(
    hcCountryAll.filter(
      (r) => r.visa === "J1" && r.monthIndex >= periodRange.start && r.monthIndex <= periodRange.end,
    ),
    (r) => r.issuances,
  );

  // Periods for the sections that don't follow the Period control.
  const fullRangeText = monthRangeLabel(data.meta.coverage.postsMonthly);
  const recoveryYear = latestCompleteYear(hcCountry);


  const empty =
    opCountryAll.length === 0 && histCountryAll.length === 0 && hcCountryAll.length === 0;

  /* ---- Headline metrics ---- */
  const metrics = useMemo(() => {
    const opF1Total = sumBy(opCountryAll.filter((r) => r.visa === "F1"), (r) => r.issuances);
    const opJ1Total = sumBy(opCountryAll.filter((r) => r.visa === "J1"), (r) => r.issuances);
    const latestFyF1 = sumBy(
      histCountryAll.filter((r) => r.fiscalYear === latestFy && r.visa === "F1"),
      (r) => r.issuances,
    );
    const latestFyJ1 = sumBy(
      histCountryAll.filter((r) => r.fiscalYear === latestFy && r.visa === "J1"),
      (r) => r.issuances,
    );
    const growth5 =
      histCountryAll.length > 0
        ? fiscalYearGrowth(histCountryAll, ["F1"], latestFy, latestFy - 5)
        : null;
    const growth10 =
      histCountryAll.length > 0
        ? fiscalYearGrowth(histCountryAll, ["F1"], latestFy, latestFy - 10)
        : null;

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
      opF1Total, opJ1Total, latestFyF1, latestFyJ1, growth5, growth10,
      latest12Hc, latest12F1, latest12J1, hcMetrics,
      topOneShare, topThreeShare, topConsulate, dataConfidence,
      category, flags, confidence, action, profile,
    };
  }, [opCountryAll, histCountryAll, hcCountry, hcCountryAll, visaClasses, country, latestFy]);

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
    // Provisional years (summed from monthly reports) get a hollow, larger marker,
    // as on Historical Trends.
    const isProvisional = years.map((year) => provisionalYears.has(year));
    const traces: Trace[] = (["F1", "J1"] as const).map((visaClass) => ({
      type: "scatter",
      mode: "lines+markers",
      name: visaClass,
      x: years,
      y: years.map((year) => byYear.get(year)![visaClass]),
      customdata: isProvisional.map((p) => (p ? " (provisional, from monthly reports)" : "")),
      hovertemplate: `<b>FY%{x}</b>%{customdata}<br>${visaClass}: %{y:,.0f}<extra></extra>`,
      line: { color: VISA_COLORS[visaClass] },
      marker: {
        color: VISA_COLORS[visaClass],
        size: isProvisional.map((p) => (p ? 11 : 7)),
        symbol: isProvisional.map((p) => (p ? "circle-open" : "circle")),
        line: { color: VISA_COLORS[visaClass], width: 2 },
      },
    })) as Trace[];
    const provisionalNotes = years
      .filter((year) => provisionalYears.has(year))
      .map((year) => ({
        x: year,
        y: Math.max(byYear.get(year)!.F1, byYear.get(year)!.J1),
        text: `FY${year} provisional`,
        showarrow: false,
        yshift: 20,
        font: { color: "#CBD5E1", size: 11 },
      }));

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
      annotations: [
        ...(histStart <= 2020 && 2020 <= histEnd
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
          : []),
        ...provisionalNotes,
      ],
    } as ChartLayout;

    return { data: traces, layout, hasRows: histRange.length > 0 };
  }, [histRange, histStart, histEnd, histCountry, provisionalYears]);



  const recovery = useMemo(() => {
    const rows: Array<{ period: string; index: number }> = [];
    if (hcCountry.length > 0) {
      // Full calendar years against 2019, then a partial latest year against 2019's same months.
      const lastFullYear = throughMonth === 12 ? endYear : endYear - 1;
      const baseline = sumBy(hcCountry.filter((r) => r.year === 2019), (r) => r.issuances);
      for (let year = 2019; year <= lastFullYear; year += 1) {
        const value = sumBy(hcCountry.filter((r) => r.year === year), (r) => r.issuances);
        if (baseline > 0) rows.push({ period: String(year), index: (value / baseline) * 100 });
      }
      if (throughMonth < 12) {
        const baselineYtd = sumBy(
          hcCountry.filter((r) => r.year === 2019 && r.month <= throughMonth),
          (r) => r.issuances,
        );
        const valueYtd = sumBy(
          hcCountry.filter((r) => r.year === endYear && r.month <= throughMonth),
          (r) => r.issuances,
        );
        if (baselineYtd > 0) {
          rows.push({
            period: `${endYear} ${yearToDateLabel(throughMonth)}`,
            index: (valueYtd / baselineYtd) * 100,
          });
        }
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
  }, [hcCountry, endYear, throughMonth]);

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

  // Latest 12 months vs the 12 before for this country and visa selection, the
  // same comparison the dashboard header uses.
  const last12 = useMemo(() => {
    const classes = selectedVisaClasses(visa);
    const rolling = rollingTotals(data.postsMonthly, data.meta.coverage.postsMonthly.end, (r) =>
      r.country === monthCountry && classes.includes(r.visa) ? "selected" : null,
    );
    const group = rolling.groups.get("selected");
    return {
      current: group?.current ?? 0,
      prior: group?.prior ?? 0,
      change: rolling.comparable ? pctGrowth(group?.current ?? 0, group?.prior ?? 0) : null,
      period: monthRangeLabel(rolling.current),
      priorPeriod: monthRangeLabel(rolling.prior),
    };
  }, [data.postsMonthly, data.meta.coverage.postsMonthly.end, monthCountry, visa]);

  const officialFys = fiscalYears.filter((f) => f.source === "annual").map((f) => f.fiscalYear);
  const lastOfficialFy = officialFys.length > 0 ? Math.max(...officialFys) : null;
  const partialFy = fiscalYears.find((f) => !f.complete && f.fiscalYear > latestFy);
  let annualSourceNote =
    lastOfficialFy === null
      ? "Annual figures are summed from the monthly nationality reports."
      : `Fiscal years through FY${lastOfficialFy} use the official annual tables.`;
  if (lastOfficialFy !== null && lastOfficialFy < latestFy) {
    annualSourceNote +=
      lastOfficialFy + 1 === latestFy
        ? ` FY${latestFy} is summed from the monthly nationality reports.`
        : ` FY${lastOfficialFy + 1}-FY${latestFy} are summed from the monthly nationality reports.`;
  }
  if (partialFy) {
    annualSourceNote += ` FY${partialFy.fiscalYear} (${partialFy.monthsIncluded} months so far) is left out until it is complete.`;
  }

  const slug = country.toLowerCase().replace(/ /g, "_");

  // The recommended action itself is shown once, in Country Recommendation; this
  // section lists only the additional actions.
  const actionCards: Array<[string, string, string, string]> = [];
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
  if (periodF1 > 0) {
    summaryBullets.push(`${country}'s F1 total is ${int(periodF1)} in ${periodRange.inSentence}.`);
  }
  if (metrics.growth10 !== null) {
    summaryBullets.push(
      `FY${latestFy} F1 issuance is ${metricPct(metrics.growth10)} versus FY${latestFy - 10}.`,
    );
  }
  if (metrics.hcMetrics.latest12Change !== null) {
    summaryBullets.push(
      `Latest 12-month consulate momentum is ${metricPct(metrics.hcMetrics.latest12Change)} versus the prior 12 months.`,
    );
  }
  if (metrics.topConsulate !== "N/A" && metrics.topOneShare !== null) {
    summaryBullets.push(
      `${metrics.topConsulate} is the leading consulate over the full history (${fullRangeText}) with ${share(metrics.topOneShare)} of ${visaLabelOf(visa)} issuance.`,
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

  /* ---- Moved from Country Intelligence (8-2a) ---- */

  // Leading consulate in the Period and over the full history: the same
  // calculation as the Consulates page (buildConsulateTable), so they match.
  const visaRows = useMemo(
    () => data.postsMonthly.filter((r) => visaClasses.includes(r.visa)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.postsMonthly, visa],
  );
  const consulateRecoveryYear = useMemo(() => recoveryYearOf(data.postsMonthly), [data.postsMonthly]);
  const fullRange = coverage.postsMonthly;
  const periodLeader = useMemo(
    () => buildConsulateTable(visaRows, periodRange, null, monthCountry, consulateRecoveryYear)[0] ?? null,
    [visaRows, periodRange, monthCountry, consulateRecoveryYear],
  );
  const historyLeader = useMemo(
    () => buildConsulateTable(visaRows, fullRange, null, monthCountry, consulateRecoveryYear)[0] ?? null,
    [visaRows, fullRange, monthCountry, consulateRecoveryYear],
  );
  const periodIsFullHistory = periodRange.start === fullRange.start && periodRange.end === fullRange.end;
  const sentenceStart = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

  // Monthly trend, Mar 2017 onward, Period shaded. F1 + J1 shows both lines.
  const monthlyTrend = useMemo(() => {
    const traces: Trace[] = (["F1", "J1"] as const)
      .filter((v) => visaClasses.includes(v))
      .map((v) => {
        const totals = groupSum(hcCountryAll.filter((r) => r.visa === v), (r) => r.monthIndex, (r) => r.issuances);
        const months = [...totals.keys()].sort((a, b) => a - b);
        return {
          type: "scatter",
          mode: "lines",
          name: v,
          x: months.map(monthDate),
          y: months.map((m) => totals.get(m)!),
          line: { color: VISA_COLORS[v], width: 2.5 },
          hovertemplate: `${v}: %{y:,.0f}<extra></extra>`,
        } as Trace;
      });
    const layout: ChartLayout = {
      height: 420,
      title: {
        text: `Monthly ${visaLabelOf(visa)} issuances - ${country}<br><sup>${fullRangeText} · shaded: ${periodRange.label}</sup>`,
      },
      hovermode: "x unified",
      xaxis: {
        title: { text: "Month" },
        type: "date",
        tickformat: "%b %Y",
        hoverformat: "%b %Y",
        dtick: "M12",
        tickangle: -45,
      },
      yaxis: { title: { text: "Issuances" } },
      shapes: [
        {
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: monthDate(periodRange.start),
          x1: monthDate(periodRange.end + 1),
          y0: 0,
          y1: 1,
          fillcolor: "#FFB81C",
          opacity: 0.12,
          line: { width: 0 },
          layer: "below",
        },
      ],
    };
    return { traces, layout };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hcCountryAll, visa, country, periodRange, fullRangeText]);

  // Compare countries: unchanged from Country Intelligence.
  const COMPARE_MAX = 8;
  const f1ByCountry = useMemo(() => {
    const totals = groupSum(f1Filtered, (r) => r.country, (r) => r.issuances);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [f1Filtered]);
  const topFive = useMemo(() => f1ByCountry.slice(0, 5), [f1ByCountry]);
  const compareList = compareCountries ?? topFive;
  const compareOptions = useMemo(() => [...consulateCountries].sort(), [consulateCountries]);
  const comparePresets = useMemo(() => {
    const regions = [...new Set(f1ByCountry.map(regionForCountry))].filter((r) => r !== "Other").sort();
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
    const traces: Trace[] = compareList.map((c) => {
      const points = [...byMonthCountry.entries()]
        .filter(([key]) => key.slice(key.indexOf("|") + 1) === c)
        .map(([key, value]) => ({ index: Number(key.split("|")[0]), value }))
        .sort((a, b) => a.index - b.index);
      return {
        type: "scatter",
        mode: "lines+markers",
        name: c,
        x: points.map((p) => monthDisplay(p.index)),
        y: points.map((p) => p.value),
        line: {},
      } as Trace;
    });
    const layout: ChartLayout = {
      height: 420,
      title: { text: `${visaLabel} Issuance Comparison Over Time, ${periodRange.label}` },
      hovermode: "x unified",
    };
    return { traces, layout };
  }, [visaFiltered, compareList, visaLabel, periodRange.label]);

  // Typical-year seasonality with the Period as a gold line: unchanged from Country Intelligence.
  const typicalSeasonality = useMemo(() => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const typicalRows = typical.rows.filter((r) => r.country === monthCountry);
    const typicalTotals = groupSum(typicalRows, (r) => r.month, (r) => r.issuances);
    const typicalCounts = calendarMonthYearCounts(typical.rows);
    const typicalAvg = months.map((m) => averagePerMonth(typicalTotals.get(m) ?? 0, m, typicalCounts));
    const periodCounts = calendarMonthYearCounts(visaFiltered);
    const periodTotals = groupSum(focusRows, (r) => r.month, (r) => r.issuances);
    const periodAvg = months.map((m) =>
      (periodCounts.get(m) ?? 0) > 0 ? averagePerMonth(periodTotals.get(m) ?? 0, m, periodCounts) : null,
    );
    const traces: Trace[] = [
      {
        type: "bar",
        name: `Typical year (${typical.label})`,
        x: months.map((m) => MONTH_NAMES[m]),
        y: typicalAvg,
        customdata: months.map((m) => typicalCounts.get(m) ?? 0),
        marker: { color: "#3D8DDE" },
        hovertemplate: `<b>%{x}</b><br>Typical year: %{y:,.0f} ${visaLabel} per month<br>Years averaged: %{customdata}<extra></extra>`,
      } as Trace,
      {
        type: "scatter",
        mode: "lines+markers",
        name: periodRange.label,
        x: months.map((m) => MONTH_NAMES[m]),
        y: periodAvg,
        line: { color: "#FFB81C", width: 3 },
        marker: { color: "#FFB81C", size: 7 },
        hovertemplate: `<b>%{x}</b><br>${periodRange.label}: %{y:,.0f} per month<extra></extra>`,
      } as Trace,
    ];
    const layout: ChartLayout = {
      height: 380,
      title: { text: `${visaLabel} Seasonality - ${country}, average per month` },
      legend: { orientation: "h", y: -0.18 },
    };
    return { traces, layout };
  }, [typical, monthCountry, visaFiltered, focusRows, visaLabel, periodRange.label, country]);

  // Active Posts and Seasonality CV (More details): unchanged from Country Intelligence.
  const activePosts = new Set(focusRows.map((r) => r.post)).size;
  const focusCv = seasonalityCv(focusRows);

  // All-country rankings (More details): unchanged from Country Intelligence.
  const rankingWindow = useMemo(() => {
    const f1 = rollingTotals(data.postsMonthly, endIndex, (r) => (r.visa === "F1" ? r.country : null));
    const j1 = rollingTotals(data.postsMonthly, endIndex, (r) => (r.visa === "J1" ? r.country : null));
    return { f1: f1.groups, j1: j1.groups, current: f1.current };
  }, [data.postsMonthly, endIndex]);
  const rankings = useMemo(
    () =>
      summary
        .map((row) => {
          const f1 = rankingWindow.f1.get(row.country);
          return {
            ...row,
            f1Last12: f1?.current ?? 0,
            j1Last12: rankingWindow.j1.get(row.country)?.current ?? 0,
            f1Change: f1?.change ?? null,
          };
        })
        .sort((a, b) => b.f1Last12 - a.f1Last12 || a.country.localeCompare(b.country)),
    [summary, rankingWindow],
  );

  const openTab = useOpenTab();

  return (
    <div className="space-y-6">
      <SectionTitle>Country 360 · {country}</SectionTitle>

      {empty ? (
        <InfoCallout>
          No validated records are available for this country across the current data layers.
        </InfoCallout>
      ) : (
        <>
          {/* 1. Primary KPIs */}
          <section>
            <SubHeading>
              Primary KPIs
              <FixedTag title="The first card follows the Period; each other card names its own fixed period.">
                First card follows the Period; others fixed
              </FixedTag>
            </SubHeading>
            <KpiRow>
              <KpiCard accent="gold" label={`F1, ${periodRange.label}`} value={metricNumber(periodF1)} />
              <KpiCard
                accent="gold"
                label={`F1 by nationality, FY${latestFy}${provisionalYears.has(latestFy) ? " (provisional)" : ""}`}
                value={metricNumber(metrics.latestFyF1)}
              />
              <KpiCard
                label={`F1 growth by nationality, FY${latestFy - 10} → FY${latestFy}`}
                value={metricPct(metrics.growth10)}
              />
              <KpiCard
                label={`Change vs previous 12 months (${last12.period})`}
                value={metricPct(metrics.hcMetrics.latest12Change)}
              />
              <KpiCard
                label={`Recovery (${recoveryYear !== null ? `${recoveryYear} vs 2019` : "vs 2019"})`}
                value={notNa(metrics.hcMetrics.recoveryIndex) ? metrics.hcMetrics.recoveryIndex.toFixed(0) : "N/A"}
                delta="100 = 2019 level"
              />
            </KpiRow>
          </section>

          {/* 2. Leading consulate, with a link to the Consulates page */}
          {(periodLeader || historyLeader) && (
            <section className="space-y-1 text-sm text-slate-300">
              {periodLeader && !periodIsFullHistory && (
                <p>
                  {sentenceStart(`in ${periodRange.inSentence}`)}, <b className="text-white">{periodLeader.post}</b>{" "}
                  leads with {periodLeader.share.toFixed(1)}% of {visaLabelOf(visa)}.
                </p>
              )}
              {historyLeader && (
                <p>
                  Over the full history ({fullRangeText}), <b className="text-white">{historyLeader.post}</b>{" "}
                  leads with {historyLeader.share.toFixed(1)}%
                  {periodIsFullHistory ? ` of ${visaLabelOf(visa)}` : ""}.
                </p>
              )}
              <button
                type="button"
                onClick={() => openTab("consulates", { scope: "country" })}
                className="text-sm font-semibold text-[#FFB81C] underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-[#FFB81C]"
              >
                See all consulates in {country} →
              </button>
            </section>
          )}

          {/* 3. Monthly trend */}
          <section>
            <SubHeading>Monthly trend</SubHeading>
            {hcCountryAll.length > 0 ? (
              <Chart data={monthlyTrend.traces} layout={monthlyTrend.layout} height={420} />
            ) : (
              <InfoCallout>No consulate rows for {country}.</InfoCallout>
            )}
            <Caption>
              <FixedTag title="This line ignores the Period control.">Always last 12 months</FixedTag>{" "}
              Last 12 months ({last12.period}): {int(last12.current)}; previous 12 months (
              {last12.priorPeriod}): {int(last12.prior)}; {arrowPct(last12.change)} vs previous 12
              months.
            </Caption>
          </section>

          {/* 4. Compare countries */}
          <section>
            <SubHeading>Compare countries</SubHeading>
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
              <Chart data={comparison.traces} layout={comparison.layout} height={420} />
            ) : (
              <InfoCallout>Add a country or pick a preset to compare.</InfoCallout>
            )}
          </section>

          {/* 5. Typical-year seasonality */}
          <section>
            <SubHeading>
              Seasonality
              <FixedTag title="The bars ignore the Period control.">Typical year: {typical.label}</FixedTag>
            </SubHeading>
            <Chart data={typicalSeasonality.traces} layout={typicalSeasonality.layout} height={380} />
            <p className="mt-2 text-xs text-slate-400">
              Bars: average per month over complete years except 2020–2021 (COVID). Gold line:{" "}
              {periodRange.inSentence}.
            </p>
          </section>

          {/* Long-term fiscal-year chart (kept visible) */}
          <section>
            <SubHeading>
              Long-Term Country Trajectory
              <FixedTag title="Uses the fiscal-year range set here.">FY{histStart}–FY{histEnd}</FixedTag>
            </SubHeading>
            <div className="mb-3 max-w-md">
              <Field label={`Fiscal years: FY${histStart} - FY${histEnd}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={firstFy}
                    max={latestFy}
                    value={histStart}
                    onChange={(e) => setHistStart(Math.min(Number(e.target.value), histEnd))}
                    className="w-full accent-[#FFB81C]"
                    aria-label="Trajectory chart start year"
                  />
                  <input
                    type="range"
                    min={firstFy}
                    max={latestFy}
                    value={histEnd}
                    onChange={(e) => setHistEnd(Math.max(Number(e.target.value), histStart))}
                    className="w-full accent-[#FFB81C]"
                    aria-label="Trajectory chart end year"
                  />
                </div>
              </Field>
            </div>
            <MethodologyNote wide>{annualSourceNote}</MethodologyNote>
            {histChart.hasRows ? (
              <Chart data={histChart.data} layout={histChart.layout} height={460} />
            ) : (
              <InfoCallout>No annual country history is available for the selected country label.</InfoCallout>
            )}
          </section>

          {/* 6. What to do: once, in plain words */}
          <section>
            <SubHeading>
              What to do
              <FixedTag title="Built from fixed periods; ignores the Period control.">Fixed periods</FixedTag>
            </SubHeading>
            <Panel accent="gold">
              <p className="text-lg font-extrabold text-white">{metrics.action}</p>
              <p className="mt-1 text-sm text-slate-300">
                {metrics.category} market · momentum: {momentumLabel} · confidence: {metrics.confidence}
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-[#DDEBFA]">
                <li>
                  <b>Why:</b> {metrics.profile.primaryDriver}.
                </li>
                <li>
                  <b>Watch:</b> {keyRisk}.
                </li>
                <li>
                  <b>Timing:</b> {metrics.profile.timing}.
                </li>
                <li>
                  <b>But:</b> {metrics.profile.counterSignal}. {metrics.profile.caveat}
                </li>
                {actionCards.map(([title, evidence, timing]) => (
                  <li key={title}>
                    <b>Also:</b> {title}. {evidence} ({timing})
                  </li>
                ))}
              </ul>
            </Panel>
          </section>

          {/* 7. More details */}
          <Expander title="More details">
            <SubHeading>Secondary KPIs</SubHeading>
            <KpiRow>
              <KpiCard accent="navy" label={`J1, ${periodRange.label}`} value={metricNumber(periodJ1)} />
              <KpiCard accent="navy" label={`FY${latestFy} Annual J1`} value={metricNumber(metrics.latestFyJ1)} />
              <KpiCard
                label={`5-year growth, FY${latestFy - 5} → FY${latestFy}${latestFy - 5 === 2020 ? " (from the pandemic low)" : ""}`}
                value={metricPct(metrics.growth5)}
              />
              <KpiCard accent="gold" label={`F1, last 12 months (${last12.period})`} value={metricNumber(metrics.latest12F1)} />
              <KpiCard accent="navy" label={`J1, last 12 months (${last12.period})`} value={metricNumber(metrics.latest12J1)} />
              <KpiCard accent="gold" label="Peak Month" value={metrics.hcMetrics.peakMonthName} valueClassName="!text-[16px]" />
              <KpiCard label="Top Consulate" value={metrics.topConsulate} valueClassName="!text-[16px]" />
              <KpiCard label="Top-One Share" value={share(metrics.topOneShare)} />
              <KpiCard label="Top-Three Share" value={share(metrics.topThreeShare)} />
              <KpiCard accent="navy" label="Volatility" value={metrics.hcMetrics.volatility} valueClassName="!text-[16px]" />
              <KpiCard label={`Active Posts (${visaLabel}), ${periodRange.label}`} value={activePosts} />
              <KpiCard label={`Seasonality CV (${visaLabel}), ${periodRange.label}`} value={decimals(focusCv, 2)} />
            </KpiRow>

            <SubHeading>Summary</SubHeading>
            <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-[#DDEBFA]">
              {summaryBullets.slice(0, 5).map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>

            <SubHeading>
              Recovery
              <FixedTag title="Latest complete calendar year vs 2019; ignores the Period control.">
                {recoveryYear !== null ? `${recoveryYear} vs 2019` : "vs 2019"}
              </FixedTag>
            </SubHeading>
            {recovery.rows.length > 0 ? (
              <Chart data={recovery.data} layout={recovery.layout} height={390} />
            ) : (
              <InfoCallout>
                Recovery index is N/A because this country has no positive 2019 baseline in the
                selected visa classes.
              </InfoCallout>
            )}

            <SubHeading>
              Momentum, Risk, and Concentration
              <FixedTag title="Ignores the Period control.">{fullRangeText} · momentum: last 12 months</FixedTag>
            </SubHeading>
            <DataTable
              height={260}
              rowKey={(row) => row.metric}
              rows={[
                { metric: "Top-one post share", value: share(metrics.topOneShare), interpretation: concentrationLabel(metrics.topOneShare) },
                { metric: "Top-three post share", value: share(metrics.topThreeShare), interpretation: concentrationLabel(metrics.topThreeShare) },
                { metric: "Monthly volatility CV", value: decimals(metrics.hcMetrics.volatilityCv, 2), interpretation: metrics.hcMetrics.volatility },
                { metric: "Latest 12-month momentum", value: metricPct(metrics.hcMetrics.latest12Change), interpretation: "Comparable 12-month change" },
                {
                  metric: "Seasonality ratio",
                  value: notNa(metrics.hcMetrics.seasonalityRatio) ? `${metrics.hcMetrics.seasonalityRatio.toFixed(1)}x` : "N/A",
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

            <SubHeading>
              All-country rankings
              <FixedTag title="The rankings ignore the Period and Visa controls.">Always last 12 months</FixedTag>
            </SubHeading>
            <p className="mb-3 text-xs text-slate-400">
              Sorted by F1 issuances in the last 12 months ({monthRangeLabel(rankingWindow.current)}). Top
              Post and Peak Month use {monthRangeLabel(operationalRange)}.
            </p>
            <DataTable
              rows={rankings}
              height={420}
              rowKey={(row) => row.country}
              columns={[
                { key: "country", header: "Country", render: (r) => r.country },
                { key: "f1", header: "F1, last 12 months", numeric: true, render: (r) => int(r.f1Last12) },
                { key: "j1", header: "J1, last 12 months", numeric: true, render: (r) => int(r.j1Last12) },
                { key: "growth", header: "F1 vs previous 12 months", numeric: true, render: (r) => arrowPct(r.f1Change) },
                { key: "post", header: "Top Post", render: (r) => r.topPost },
                { key: "peak", header: "Peak Month", render: (r) => MONTH_NAMES_FULL[r.peakMonth] ?? "N/A" },
              ]}
            />

            <SubHeading>Downloads</SubHeading>
            <div className="flex flex-wrap gap-2">
              <DownloadCsvButton
                label="Country 360 Summary CSV"
                filename={`qu_country360_summary_${slug}_${periodRange.slug}.csv`}
                headers={[
                  "country", `f1_total_${periodRange.slug}`, `j1_total_${periodRange.slug}`, `fy${latestFy}_f1`, `fy${latestFy}_j1`,
                  "f1_growth_5yr_pct", "f1_growth_10yr_pct", "top_consulate", "peak_month",
                  "recovery_index", "top_one_share", "top_three_share", "volatility", "data_confidence",
                ]}
                rows={[[
                  country,
                  String(periodF1),
                  String(periodJ1),
                  String(metrics.latestFyF1),
                  String(metrics.latestFyJ1),
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
                rows={histRange.map((r) => [String(r.fiscalYear), r.country, r.visa, String(r.issuances)])}
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
                    ? seasonality.rows.map((r) => [r.month, String(r.calendarMonth), String(r.average), String(r.median)])
                    : []
                }
              />
              <DownloadCsvButton
                label="Current Operational Country CSV"
                filename={`qu_country360_operational_${slug}_${visa.toLowerCase()}_${periodRange.slug}.csv`}
                headers={["post", "visa_class", "issuances", "year", "month"]}
                rows={opPeriod.map((r) => [r.post, r.visa, String(r.issuances), String(r.year), String(r.month)])}
              />
            </div>

            <Expander title="Methodology Details">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Historical country layer: <code className="font-mono">{histCountry}</code> annual
                  country/nationality data from FY{firstFy}-FY{latestFy}.
                </li>
                <li>
                  Historical consulate layer: <code className="font-mono">{monthCountry}</code>{" "}
                  monthly post data from {monthLongDisplay(coverage.postsMonthly.start)}-
                  {monthLongDisplay(endIndex)}.
                </li>
                <li>
                  Country label bridge: <code className="font-mono">{country}</code> maps to monthly
                  label <code className="font-mono">{monthCountry}</code> and annual label{" "}
                  <code className="font-mono">{histCountry}</code>.
                </li>
                <li>Annual totals and monthly post totals remain separate and are not added together.</li>
                {throughMonth < 12 && (
                  <li>
                    {endYear} is partial for monthly records, through {monthLongDisplay(endIndex)}.
                  </li>
                )}
                <li>
                  Issuance volume is not individual visa approval probability and is not QU
                  enrollment data.
                </li>
              </ul>
            </Expander>
          </Expander>
        </>
      )}
    </div>
  );
}

/** First day of a `year * 12 + (month - 1)` month, for a Plotly date axis. */
function monthDate(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

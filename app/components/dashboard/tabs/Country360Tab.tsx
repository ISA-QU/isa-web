"use client";

import { useMemo, useState } from "react";
import type { ChartLayout, Trace } from "../Chart";

import { MONTH_NAMES, VISA_COLORS } from "../../../lib/dashboard/constants";
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
  LOW_VOLUME,
  MIN_BASE,
  NO_LOCAL_VISAS,
  changeText,
  changeVsBase,
  isLowVolume,
  lastTwelve,
  latestCompleteYearOf,
  monthlySeries,
  seasonalityCvIn,
  typicalYear,
} from "../../../lib/dashboard/measures";
import {
  buildCommandCenterFrame,
  concentrationLabel,
  fiscalYearGrowth,
  groupSum,
  notNa,
  recommendedOutreachWindow,
  selectedVisaClasses,
  seasonalityStrengthLabel,
  sumBy,
  historicalCountryName,
  monthlyCountryName,
  nationalitySignals,
  peakMonthLabel,
  regionForCountry,
  volatilityLabel,
} from "../../../lib/dashboard/metrics";
import { buildConsulateTable, previousPeriod } from "../../../lib/dashboard/consulates";
import { restrictionCsv } from "../../../lib/dashboard/restrictions";
import { arrowPct, monthRangeLabel, rollingTotals } from "../../../lib/dashboard/rolling";
import type { MonthRange, Visa } from "../../../lib/dashboard/types";
import Chart from "../Chart";
import ComparePicker from "../ComparePicker";
import RestrictionBadges, { RestrictionSmallPrint } from "../RestrictionBadges";
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


/** A monthly row from either source: nationality (who received the visa) or consulate (where it was issued). */
type MonthRow = { year: number; month: number; monthIndex: number; visa: Visa; issuances: number };

const inRange = (range: MonthRange) => (r: { monthIndex: number }) =>
  r.monthIndex >= range.start && r.monthIndex <= range.end;
const total = (rows: readonly { issuances: number }[]) => sumBy(rows, (r) => r.issuances);

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
    allCountries,
    summary,
  } = useDashboard();
  const { coverage, fiscalYears } = data.meta;
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

  // By nationality (8-2b): the country's nationals, wherever their visas were
  // issued. Falls back to visas issued in the country, with a banner, when the
  // snapshot has no nationality table or no rows for this country.
  const nationalityTable = data.nationalityMonthly;
  const nationalityAll = useMemo(
    () => nationalityTable?.filter((r) => r.isCountry && r.country === country) ?? [],
    [nationalityTable, country],
  );
  const byNationality = nationalityAll.length > 0;
  const leadAll: readonly MonthRow[] = byNationality ? nationalityAll : hcCountryAll;
  const lead = useMemo(() => leadAll.filter((r) => visaClasses.includes(r.visa)), [leadAll, visaClasses]);
  /** "nationals of India", or "issued in India" in the fallback. */
  const leadName = byNationality ? `nationals of ${country}` : `issued in ${country}`;
  /** The same at the start of a sentence. */
  const LeadName = leadName.charAt(0).toUpperCase() + leadName.slice(1);
  const hasLeadRows = lead.length > 0;

  // "Current Operational Signal" follows the control bar's Period. It reads the
  // full monthly consulate data, so any period since Mar 2017 works.
  const opPeriod = useMemo(() => hcCountry.filter(inRange(periodRange)), [hcCountry, periodRange]);

  // F1 and J1 for the Period (whatever the Visa).
  const periodF1 = total(leadAll.filter((r) => r.visa === "F1" && inRange(periodRange)(r)));
  const periodJ1 = total(leadAll.filter((r) => r.visa === "J1" && inRange(periodRange)(r)));

  // The change card follows the Period, against the previous period of equal length (as on Consulates).
  const priorRange = previousPeriod(periodRange, coverage.postsMonthly);
  const periodChange = (rows: readonly MonthRow[]) => {
    const now = total(rows.filter(inRange(periodRange)));
    const before = priorRange ? total(rows.filter(inRange(priorRange))) : null;
    return { now, before, change: before === null ? null : changeVsBase(now, before) };
  };
  const leadPeriod = periodChange(lead);
  // "last 12 months (Mar 2025 – Feb 2026)" and "previous 12 months (Mar 2024 – Feb 2025)" for sentences.
  const periodLabelLower = periodRange.label.charAt(0).toLowerCase() + periodRange.label.slice(1);
  const previousLabel = priorRange
    ? `previous ${priorRange.end - priorRange.start + 1 === 1 ? "month" : `${priorRange.end - priorRange.start + 1} months`} (${monthRangeLabel(priorRange)})`
    : "";
  const issuedPeriod = periodChange(hcCountry);
  /** "▼ 59.6%", "— (low volume)", "—" with no previous period, "N/A" with no rows. */
  const periodChangeText = (
    figures: { before: number | null; change: number | null },
    hasRows: boolean,
    format: (value: number) => string,
  ) => (!hasRows ? "N/A" : figures.before === null ? "—" : changeText(figures.change, figures.before, format));

  // Periods for the sections that don't follow the Period control.
  const fullRangeText = monthRangeLabel(data.meta.coverage.postsMonthly);
  // The data's latest complete year, the same for every country (never this country's own last row).
  const recoveryYear = latestCompleteYearOf(coverage.postsMonthly);

  const empty =
    opCountryAll.length === 0 &&
    histCountryAll.length === 0 &&
    hcCountryAll.length === 0 &&
    nationalityAll.length === 0;

  /* ---- Headline metrics ---- */
  const metrics = useMemo(() => {
    const latestFyF1 = total(histCountryAll.filter((r) => r.fiscalYear === latestFy && r.visa === "F1"));
    const latestFyJ1 = total(histCountryAll.filter((r) => r.fiscalYear === latestFy && r.visa === "J1"));
    const growth5 =
      histCountryAll.length > 0
        ? fiscalYearGrowth(histCountryAll, ["F1"], latestFy, latestFy - 5)
        : null;
    const growth10 =
      histCountryAll.length > 0
        ? fiscalYearGrowth(histCountryAll, ["F1"], latestFy, latestFy - 10)
        : null;

    // Last 12 months end at the data's last month for every country.
    const twelve = lastTwelve(lead, endIndex);
    const last12 = inRange(twelve.currentRange);
    const latest12F1 = visaClasses.includes("F1") ? total(lead.filter((r) => r.visa === "F1" && last12(r))) : null;
    const latest12J1 = visaClasses.includes("J1") ? total(lead.filter((r) => r.visa === "J1" && last12(r))) : null;

    // Consulate concentration: always where visas were issued.
    const postTotals = [...groupSum(hcCountry, (r) => r.post, (r) => r.issuances).entries()].sort(
      (a, b) => b[1] - a[1],
    );
    const hcTotal = postTotals.reduce((t, [, v]) => t + v, 0);
    const topConsulate = postTotals.length > 0 ? postTotals[0][0] : "N/A";
    const topOneShare = hcTotal ? postTotals.slice(0, 1).reduce((t, [, v]) => t + v, 0) / hcTotal : null;
    const topThreeShare = hcTotal ? postTotals.slice(0, 3).reduce((t, [, v]) => t + v, 0) / hcTotal : null;
    const dataConfidence =
      leadAll.length > 0 && histCountryAll.length > 0 ? "High" : "Partial";

    // "What to do": by nationality when possible (no consulate concentration, plus
    // the small- and collapsing-market rules); otherwise the Command Center's row.
    const nationalityRow = nationalitySignals(
      nationalityTable,
      data.annualCountry,
      country,
      visa,
      coverage.annual.latestComplete,
      coverage.postsMonthly,
      coverage.operational,
    );
    const row =
      nationalityRow ??
      buildCommandCenterFrame(
        data.operational,
        data.annualCountry,
        data.postsMonthly,
        visa,
        coverage.annual.latestComplete,
        coverage.postsMonthly,
        [monthCountry],
      )[0] ??
      null;
    const leadMetrics = {
      latest12Change: row?.latest12Momentum ?? null,
      recoveryIndex: row?.recoveryIndex ?? null,
      peakMonth: row?.peakMonth ?? null,
      peakMonthName: row?.peakMonthName ?? "N/A",
      seasonalityRatio: row?.seasonalityRatio ?? null,
      seasonalityStrength: seasonalityStrengthLabel(row?.seasonalityRatio ?? null),
      volatilityCv: row?.volatilityCv ?? null,
      volatility: volatilityLabel(row?.volatilityCv ?? null),
    };
    const flags = row?.secondaryFlags ?? [];
    // Timing advice doesn't apply to a small or collapsing market, or with no visas in the last 12 months.
    const hideTiming = nationalityRow ? nationalityRow.hideTiming : (row?.latest12Total ?? 0) === 0;
    const confidence =
      dataConfidence === "High" && !flags.includes("Low Confidence") ? "High" : dataConfidence;

    return {
      latestFyF1, latestFyJ1, growth5, growth10,
      twelve, latest12F1, latest12J1, leadMetrics,
      topOneShare, topThreeShare, topConsulate, dataConfidence, hideTiming,
      category: row?.marketCategory ?? "Watch",
      flags,
      confidence,
      action: row?.recommendedAction ?? "Insufficient Evidence",
      profile: {
        primaryDriver: row?.primaryDriver ?? NO_LOCAL_VISAS,
        counterSignal: row?.counterSignal ?? "No material counter-signal",
        timing: row?.timing ?? "",
        caveat: row?.caveat ?? "",
      },
    };
  }, [
    histCountryAll, hcCountry, lead, leadAll, visaClasses, latestFy, endIndex, nationalityTable,
    data.operational, data.annualCountry, data.postsMonthly, visa, coverage, monthCountry, country,
  ]);

  const momentum = metrics.leadMetrics.latest12Change;
  const momentumLabel = !notNa(momentum)
    ? hasLeadRows && isLowVolume(metrics.twelve.prior)
      ? "low volume"
      : "N/A"
    : momentum <= -20
      ? "Weak"
      : momentum >= 15
        ? "Strong"
        : "Stable";

  const keyRiskParts: string[] = [];
  if (metrics.flags.includes("High Concentration") && metrics.topThreeShare !== null) {
    keyRiskParts.push(`top-three post concentration ${share(metrics.topThreeShare)}`);
  }
  if (metrics.flags.includes("Volatile") && metrics.leadMetrics.volatilityCv !== null) {
    keyRiskParts.push(`volatility CV ${metrics.leadMetrics.volatilityCv.toFixed(2)}`);
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
    if (lead.length > 0) {
      // Full calendar years against 2019, then a partial latest year against 2019's same months.
      const lastFullYear = throughMonth === 12 ? endYear : endYear - 1;
      const baseline = total(lead.filter((r) => r.year === 2019));
      for (let year = 2019; year <= lastFullYear; year += 1) {
        const value = total(lead.filter((r) => r.year === year));
        if (baseline >= MIN_BASE) rows.push({ period: String(year), index: (value / baseline) * 100 });
      }
      if (throughMonth < 12) {
        const baselineYtd = total(lead.filter((r) => r.year === 2019 && r.month <= throughMonth));
        const valueYtd = total(lead.filter((r) => r.year === endYear && r.month <= throughMonth));
        if (baseline >= MIN_BASE && baselineYtd > 0) {
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
      title: { text: `Recovery Index, ${leadName}: 2019 = 100` },
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
  }, [lead, endYear, throughMonth, leadName]);

  const seasonality = useMemo(() => {
    // Typical year: each calendar month's country total in each typical year
    // (missing months as 0), then the average and median across those years.
    const byYearMonth = groupSum(lead, (r) => r.year * 12 + (r.month - 1), (r) => r.issuances);
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const rows = months.map((month) => {
      const values = typical.years.map((year) => byYearMonth.get(year * 12 + (month - 1)) ?? 0);
      return {
        month: MONTH_NAMES[month],
        calendarMonth: month,
        average: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        median: median(values),
      };
    });

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
      title: { text: `Average and Median Calendar-Month Issuance - ${leadName}` },
      xaxis: { title: { text: "Calendar Month" }, categoryorder: "array", categoryarray: rows.map((r) => r.month) },
    };
    return { data, layout, rows };
  }, [lead, leadName, typical.years]);

  // Latest 12 months vs the 12 before, for the lead measure and for visas issued
  // in the country. The change is "— (low volume)" when the previous 12 months are below 100.
  const last12 = useMemo(() => {
    const twelve = lastTwelve(lead, endIndex);
    const issued = lastTwelve(hcCountry, endIndex);
    return {
      current: twelve.current,
      prior: twelve.prior,
      change: twelve.change,
      issued,
      period: monthRangeLabel(twelve.currentRange),
      priorPeriod: monthRangeLabel(twelve.priorRange),
    };
  }, [lead, hcCountry, endIndex]);
  /** The lead measure's 12-month change: "N/A" with no rows, "— (low volume)" below 100. */
  const leadChangeText = (format: (value: number) => string) =>
    !hasLeadRows ? "N/A" : changeText(last12.change, last12.prior, format);
  const issuedChangeText = (format: (value: number) => string) =>
    hcCountry.length === 0 ? "N/A" : changeText(last12.issued.change, last12.issued.prior, format);
  const recoveryValueText = notNa(metrics.leadMetrics.recoveryIndex)
    ? metrics.leadMetrics.recoveryIndex.toFixed(0)
    : hasLeadRows
      ? LOW_VOLUME
      : "N/A";
  // Most of the country's nationals got their visas elsewhere: fewer than half were issued in the country.
  const mostlyElsewhere =
    byNationality && last12.current > 0 && last12.issued.current < last12.current / 2;

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
  // Timing-based cards don't apply with no visas issued locally in the last 12 months.
  if (metrics.flags.includes("Highly Seasonal") && !metrics.hideTiming) {
    actionCards.push([
      "Begin Outreach Earlier",
      `Peak issuance month is ${metrics.leadMetrics.peakMonthName} with ${decimals(metrics.leadMetrics.seasonalityRatio, 1)}x average-month strength.`,
      recommendedOutreachWindow(metrics.leadMetrics.peakMonth),
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
  if (metrics.flags.includes("Volatile") && !metrics.hideTiming) {
    actionCards.push([
      "Prepare for Peak Support Workload",
      `Monthly volatility CV is ${decimals(metrics.leadMetrics.volatilityCv, 2)}.`,
      metrics.leadMetrics.peakMonth !== null ? `Before ${metrics.leadMetrics.peakMonthName} peak` : "Monthly monitoring",
      "Use as workload planning, not individual approval prediction.",
    ]);
  }

  const summaryBullets: string[] = [];
  if (periodF1 > 0) {
    summaryBullets.push(
      byNationality
        ? `Nationals of ${country} received ${int(periodF1)} F1 visas in ${periodRange.inSentence}.`
        : `${int(periodF1)} F1 visas were issued in ${country} in ${periodRange.inSentence}.`,
    );
  }
  if (metrics.growth10 !== null) {
    summaryBullets.push(
      `FY${latestFy} F1 visas to nationals of ${country} are ${metricPct(metrics.growth10)} versus FY${latestFy - 10}.`,
    );
  }
  if (metrics.leadMetrics.latest12Change !== null) {
    summaryBullets.push(
      `${LeadName} (${visaLabelOf(visa)}): ${metricPct(metrics.leadMetrics.latest12Change)} in the last 12 months versus the 12 before.`,
    );
  }
  if (metrics.topConsulate !== "N/A" && metrics.topOneShare !== null) {
    summaryBullets.push(
      `Issued in ${country}: ${metrics.topConsulate} is the leading consulate over the full history (${fullRangeText}) with ${share(metrics.topOneShare)} of ${visaLabelOf(visa)}.`,
    );
  }
  if (metrics.leadMetrics.peakMonth !== null) {
    summaryBullets.push(
      `Peak recruitment-planning month is ${metrics.leadMetrics.peakMonthName} in a typical year (${typical.label}).`,
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
  const consulateRecoveryYear = recoveryYear;
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

  // Monthly trend, Mar 2017 onward, Period shaded. F1 + J1 shows both lines.
  const monthlyTrend = useMemo(() => {
    const visas = (["F1", "J1"] as const).filter((v) => visaClasses.includes(v));
    const x = monthlySeries([], coverage.postsMonthly).map((_, i) => monthDate(coverage.postsMonthly.start + i));
    // Every month of the coverage: lines drop to 0 where there were no visas.
    const traces: Trace[] = visas.map(
      (v) =>
        ({
          type: "scatter",
          mode: "lines",
          name: byNationality ? `${v}, nationals of ${country}` : `${v}, issued in ${country}`,
          x,
          y: monthlySeries(leadAll.filter((r) => r.visa === v), coverage.postsMonthly),
          line: { color: VISA_COLORS[v], width: 2.5 },
          hovertemplate: `${v}: %{y:,.0f}<extra></extra>`,
        }) as Trace,
    );
    // Alongside the nationals: visas issued in the country, dotted and lighter (click the legend to hide).
    if (byNationality && hcCountryAll.length > 0) {
      for (const v of visas) {
        traces.push({
          type: "scatter",
          mode: "lines",
          name: `${v}, issued in ${country}`,
          x,
          y: monthlySeries(hcCountryAll.filter((r) => r.visa === v), coverage.postsMonthly),
          line: { color: VISA_COLORS[v], width: 1.5, dash: "dot" },
          opacity: 0.55,
          hovertemplate: `${v} issued in ${country}: %{y:,.0f}<extra></extra>`,
        } as Trace);
      }
    }
    const layout: ChartLayout = {
      height: 420,
      title: {
        text: `Monthly ${visaLabelOf(visa)} visas - ${leadName}<br><sup>${fullRangeText} · shaded: ${periodRange.label}</sup>`,
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
  }, [leadAll, hcCountryAll, byNationality, leadName, visa, country, periodRange, fullRangeText]);

  // Compare countries: by nationality (countries in the Country control only, so
  // Montserrat and Western Sahara are left out), or by where issued without the table.
  const COMPARE_MAX = 8;
  const controlCountries = useMemo(() => new Set(allCountries), [allCountries]);
  const comparePeriodRows = useMemo(
    () =>
      nationalityTable
        ? nationalityTable.filter(
            (r) => r.isCountry && controlCountries.has(r.country) && inRange(periodRange)(r),
          )
        : null,
    [nationalityTable, controlCountries, periodRange],
  );
  const f1ByCountry = useMemo(() => {
    const totals = comparePeriodRows
      ? groupSum(comparePeriodRows.filter((r) => r.visa === "F1"), (r) => r.country, (r) => r.issuances)
      : groupSum(f1Filtered, (r) => r.country, (r) => r.issuances);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [comparePeriodRows, f1Filtered]);
  const topFive = useMemo(() => f1ByCountry.slice(0, 5), [f1ByCountry]);
  const compareList = compareCountries ?? topFive;
  const compareOptions = useMemo(
    () =>
      nationalityTable
        ? [...new Set(nationalityTable.filter((r) => r.isCountry && controlCountries.has(r.country)).map((r) => r.country))].sort()
        : [...consulateCountries].sort(),
    [nationalityTable, controlCountries, consulateCountries],
  );
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
    const source: readonly { country: string; visa: Visa; year: number; month: number; issuances: number }[] =
      comparePeriodRows ? comparePeriodRows.filter((r) => visaClasses.includes(r.visa)) : visaFiltered;
    const rows = source.filter((r) => compareList.includes(r.country));
    const byMonthCountry = groupSum(
      rows,
      (r) => `${r.year * 12 + (r.month - 1)}|${r.country}`,
      (r) => r.issuances,
    );
    // Every month of the Period for every country (missing months as 0), so the months stay in order.
    const traces: Trace[] = compareList.map((c) => {
      const points = Array.from({ length: periodRange.end - periodRange.start + 1 }, (_, i) => ({
        index: periodRange.start + i,
        value: byMonthCountry.get(`${periodRange.start + i}|${c}`) ?? 0,
      }));
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
      title: {
        text: `${visaLabel} visas ${comparePeriodRows ? "by nationality" : "by country where issued"}, ${periodRange.label}`,
      },
      hovermode: "x unified",
    };
    return { traces, layout };
  }, [comparePeriodRows, visaFiltered, visaClasses, compareList, visaLabel, periodRange]);

  // Typical-year seasonality with the Period as a gold line: unchanged from Country Intelligence.
  const typicalSeasonality = useMemo(() => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    // The shared typical year (missing months as 0), for the lead measure.
    const typicalAvg = typicalYear(lead, typical.years).averages;
    // The Period's average per calendar month: each month's total ÷ how often it occurs in the Period.
    const periodTotals = new Array<number>(13).fill(0);
    const periodCounts = new Array<number>(13).fill(0);
    for (let i = periodRange.start; i <= periodRange.end; i += 1) periodCounts[(i % 12) + 1] += 1;
    for (const r of lead) if (inRange(periodRange)(r)) periodTotals[r.month] += r.issuances;
    const periodAvg = months.map((m) => (periodCounts[m] > 0 ? periodTotals[m] / periodCounts[m] : null));
    const traces: Trace[] = [
      {
        type: "bar",
        name: `Typical year (${typical.label})`,
        x: months.map((m) => MONTH_NAMES[m]),
        y: typicalAvg,
        customdata: months.map(() => typical.years.length),
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
      title: { text: `${visaLabel} Seasonality - ${leadName}, average per month` },
      legend: { orientation: "h", y: -0.18 },
    };
    return { traces, layout };
  }, [typical, lead, leadName, visaLabel, periodRange]);

  // Active Posts and Seasonality CV (More details): unchanged from Country Intelligence.
  const activePosts = new Set(focusRows.map((r) => r.post)).size;
  const focusCv = seasonalityCvIn(lead.filter(inRange(periodRange)), periodRange);

  // All-country rankings (More details): unchanged from Country Intelligence.
  const rankingWindow = useMemo(() => {
    const f1 = rollingTotals(data.postsMonthly, endIndex, (r) => (r.visa === "F1" ? r.country : null));
    const j1 = rollingTotals(data.postsMonthly, endIndex, (r) => (r.visa === "J1" ? r.country : null));
    const posts = rollingTotals(data.postsMonthly, endIndex, (r) => (r.visa === "F1" ? `${r.country}|${r.post}` : null));
    // Top post: most F1 in the last 12 months (ties: alphabetical).
    const topPost = new Map<string, { post: string; value: number }>();
    for (const [key, group] of posts.groups) {
      if (group.current <= 0) continue;
      const [c, post] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
      const best = topPost.get(c);
      if (!best || group.current > best.value || (group.current === best.value && post < best.post)) {
        topPost.set(c, { post, value: group.current });
      }
    }
    return { f1: f1.groups, j1: j1.groups, current: f1.current, topPost };
  }, [data.postsMonthly, endIndex]);
  // The rankings' rows: F1 by nationality when the table is there (countries in
  // the Country control), otherwise by where issued.
  const rankingRows = useMemo(
    () =>
      nationalityTable
        ? nationalityTable.filter((r) => r.isCountry && controlCountries.has(r.country))
        : (data.postsMonthly as readonly (MonthRow & { country: string })[]),
    [nationalityTable, controlCountries, data.postsMonthly],
  );
  // Peak month (typical year, F1) for every country: the shared calculation.
  const f1PeakByCountry = useMemo(() => {
    const byCountry = new Map<string, MonthRow[]>();
    for (const row of rankingRows) {
      if (row.visa !== "F1") continue;
      const list = byCountry.get(row.country);
      if (list) list.push(row);
      else byCountry.set(row.country, [row]);
    }
    return new Map([...byCountry].map(([c, rows]) => [c, peakMonthLabel(typicalYear(rows, typical.years))]));
  }, [rankingRows, typical.years]);
  const rankings = useMemo(() => {
    const twelve = (visaClass: Visa) => {
      const out = new Map<string, MonthRow[]>();
      for (const row of rankingRows) {
        if (row.visa !== visaClass) continue;
        const list = out.get(row.country);
        if (list) list.push(row);
        else out.set(row.country, [row]);
      }
      return new Map([...out].map(([c, rows]) => [c, lastTwelve(rows, endIndex)]));
    };
    const f1 = twelve("F1");
    const j1 = twelve("J1");
    const countries = nationalityTable ? [...new Set([...f1.keys(), ...j1.keys()])] : summary.map((r) => r.country);
    return countries
      .map((c) => {
        const f = f1.get(c);
        return {
          country: c,
          f1Last12: f?.current ?? 0,
          j1Last12: j1.get(c)?.current ?? 0,
          f1Change: f?.change ?? null,
          f1Prior: f?.prior ?? 0,
          topPost: rankingWindow.topPost.get(c)?.post ?? "N/A",
          peakName: f1PeakByCountry.get(c) ?? "N/A",
        };
      })
      .sort((a, b) => b.f1Last12 - a.f1Last12 || a.country.localeCompare(b.country));
  }, [rankingRows, nationalityTable, summary, rankingWindow, f1PeakByCountry, endIndex]);

  const openTab = useOpenTab();

  return (
    <div className="space-y-6">
      <SectionTitle>Country 360 · {country}</SectionTitle>
      <RestrictionBadges country={country} />

      {empty ? (
        <InfoCallout>
          No validated records are available for this country across the current data layers.
        </InfoCallout>
      ) : (
        <>
          {/* 0. What the page measures */}
          {byNationality ? (
            <div className="space-y-1 text-xs leading-relaxed text-slate-400">
              <p>
                Nationality = the passport the visa was issued to, not where the person lives. Issued
                in = the U.S. consulates in that country, which also serve other nationalities.
              </p>
            </div>
          ) : (
            <InfoCallout>
              {nationalityTable === null
                ? `Monthly nationality data isn't in this data snapshot, so Country 360 shows visas issued in ${country} (the U.S. consulates there) instead.`
                : `No monthly nationality data for ${country}, so Country 360 shows visas issued in ${country} (the U.S. consulates there) instead.`}
            </InfoCallout>
          )}
          {mostlyElsewhere && (
            <InfoCallout>
              Most visas to nationals of {country} are issued outside {country}: in the last 12 months,{" "}
              {int(last12.issued.current)} were issued in {country} against {int(last12.current)} to
              nationals of {country} ({visaLabelOf(visa)}).
            </InfoCallout>
          )}

          {/* 1. Primary KPIs */}
          <section>
            <SubHeading>
              Primary KPIs
              <FixedTag title="The first and change cards follow the Period; the others name their own fixed period.">
                First and change cards follow the Period; others fixed
              </FixedTag>
            </SubHeading>
            <KpiRow>
              <KpiCard accent="gold" label={`F1, ${leadName}, ${periodRange.label}`} value={metricNumber(periodF1)} />
              <KpiCard
                accent="gold"
                label={`F1 by nationality, FY${latestFy}${provisionalYears.has(latestFy) ? " (provisional)" : ""}`}
                value={metricNumber(metrics.latestFyF1)}
              />
              <KpiCard
                label={`F1 growth by nationality, FY${latestFy - 10} → FY${latestFy}`}
                value={arrowPct(metrics.growth10)}
              />
              <KpiCard
                label={`${visaLabelOf(visa)} change vs ${priorRange ? monthRangeLabel(priorRange) : "previous period"}`}
                value={periodChangeText(leadPeriod, hasLeadRows, arrowPct)}
                delta={priorRange ? undefined : "No previous period of the same length"}
              />
              <KpiCard
                label={`Recovery, ${leadName} (${recoveryYear !== null ? `${recoveryYear} vs 2019` : "vs 2019"})`}
                value={recoveryValueText}
                delta="100 = 2019 level"
              />
            </KpiRow>
            {byNationality && (
              <p className="mt-2 text-sm text-slate-300">
                <b className="text-white">Issued in {country}</b>, {visaLabelOf(visa)}, {periodLabelLower}:{" "}
                {hcCountry.length > 0
                  ? `${int(issuedPeriod.now)}. ${priorRange ? `Change vs ${previousLabel}` : "Change"}: ${periodChangeText(issuedPeriod, true, arrowPct)}.`
                  : "no U.S. consulate data."}
              </p>
            )}
          </section>

          {/* 2. Leading consulate, with a link to the Consulates page */}
          {(periodLeader || historyLeader) && (
            <section className="space-y-1 text-sm text-slate-300">
              {periodLeader && !periodIsFullHistory && (
                <p>
                  Issued in {country}, in {periodRange.inSentence}, <b className="text-white">{periodLeader.post}</b>{" "}
                  leads with {periodLeader.share.toFixed(1)}% of {visaLabelOf(visa)}.
                </p>
              )}
              {historyLeader && (
                <p>
                  Issued in {country}, over the full history ({fullRangeText}), <b className="text-white">{historyLeader.post}</b>{" "}
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
            {leadAll.length > 0 ? (
              <Chart data={monthlyTrend.traces} layout={monthlyTrend.layout} height={420} />
            ) : (
              <InfoCallout>No monthly rows for {leadName}.</InfoCallout>
            )}
            <Caption>
              <FixedTag title="This line ignores the Period control.">Always last 12 months</FixedTag>{" "}
              {LeadName}, last 12 months ({last12.period}): {int(last12.current)}; previous 12 months (
              {last12.priorPeriod}): {int(last12.prior)}; {leadChangeText(arrowPct)} vs previous 12
              months.
              {byNationality &&
                ` Issued in ${country}: ${hcCountry.length > 0 ? `${int(last12.issued.current)}; change vs previous 12 months: ${issuedChangeText(arrowPct)}` : "no U.S. consulate data"}.`}
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
                  Showing the default: top 5 markets by F1 {comparePeriodRows ? "nationals" : "issued"} in {periodRange.label}.
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
              <FixedTag title="Built from fixed periods; ignores the Period control.">
                {byNationality ? "Fixed periods · by nationality" : "Fixed periods · issued in"}
              </FixedTag>
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
                {metrics.profile.timing && (
                  <li>
                    <b>Timing:</b> {metrics.profile.timing}.
                  </li>
                )}
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
            <div className="mt-2">
              <RestrictionSmallPrint />
            </div>
          </section>

          {/* 7. More details */}
          <Expander title="More details">
            <SubHeading>Secondary KPIs</SubHeading>
            <KpiRow>
              <KpiCard accent="navy" label={`J1, ${leadName}, ${periodRange.label}`} value={metricNumber(periodJ1)} />
              <KpiCard accent="navy" label={`J1 by nationality, FY${latestFy}`} value={metricNumber(metrics.latestFyJ1)} />
              <KpiCard
                label={`F1 growth by nationality, FY${latestFy - 5} → FY${latestFy}${latestFy - 5 === 2020 ? " (from the pandemic low)" : ""}`}
                value={arrowPct(metrics.growth5)}
              />
              <KpiCard accent="gold" label={`F1, ${leadName}, last 12 months (${last12.period})`} value={metricNumber(metrics.latest12F1)} />
              <KpiCard accent="navy" label={`J1, ${leadName}, last 12 months (${last12.period})`} value={metricNumber(metrics.latest12J1)} />
              <KpiCard accent="gold" label={`Peak month (typical year), ${leadName}`} value={metrics.leadMetrics.peakMonthName} valueClassName="!text-[16px]" />
              <KpiCard label={`Top consulate (issued in ${country})`} value={metrics.topConsulate} valueClassName="!text-[16px]" />
              <KpiCard label={`Top-one share (issued in ${country})`} value={share(metrics.topOneShare)} />
              <KpiCard label={`Top-three share (issued in ${country})`} value={share(metrics.topThreeShare)} />
              <KpiCard accent="navy" label={`Volatility, ${leadName}`} value={metrics.leadMetrics.volatility} valueClassName="!text-[16px]" />
              <KpiCard label={`Active posts (issued in ${country}, ${visaLabel}), ${periodRange.label}`} value={activePosts} />
              <KpiCard label={`Seasonality CV (${visaLabel}, ${leadName}), ${periodRange.label}`} value={decimals(focusCv, 2)} />
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
                Recovery index {hasLeadRows ? LOW_VOLUME : "N/A"}: needs at least {MIN_BASE} issuances
                in 2019 in the selected visa classes.
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
                { metric: `Top-one post share (issued in ${country})`, value: share(metrics.topOneShare), interpretation: concentrationLabel(metrics.topOneShare) },
                { metric: `Top-three post share (issued in ${country})`, value: share(metrics.topThreeShare), interpretation: concentrationLabel(metrics.topThreeShare) },
                { metric: `Monthly volatility CV, ${leadName}`, value: decimals(metrics.leadMetrics.volatilityCv, 2), interpretation: metrics.leadMetrics.volatility },
                { metric: `Latest 12-month momentum, ${leadName}`, value: leadChangeText(metricPct), interpretation: "Comparable 12-month change" },
                {
                  metric: `Seasonality ratio, ${leadName}`,
                  value: notNa(metrics.leadMetrics.seasonalityRatio)
                    ? `${metrics.leadMetrics.seasonalityRatio.toFixed(1)}x`
                    : metrics.leadMetrics.peakMonthName === LOW_VOLUME
                      ? LOW_VOLUME
                      : "N/A",
                  interpretation: metrics.leadMetrics.seasonalityStrength,
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
                  Momentum uses the latest 12 months versus the preceding 12 months
                  {byNationality ? " of visas to the country's nationals (monthly nationality data)" : " of visas issued in the country"}.
                </li>
              </ul>
            </Expander>

            <SubHeading>
              All-country rankings
              <FixedTag title="The rankings ignore the Period and Visa controls.">Always last 12 months</FixedTag>
            </SubHeading>
            <p className="mb-3 text-xs text-slate-400">
              {nationalityTable ? "By nationality: sorted by F1 visas to each country's nationals" : "Sorted by F1 issuances"}{" "}
              in the last 12 months ({monthRangeLabel(rankingWindow.current)}). Top post (issued in): the
              consulate in that country with the most F1 in the same 12 months. Peak month: F1 in a
              typical year ({typical.label}).
            </p>
            <DataTable
              rows={rankings}
              height={420}
              rowKey={(row) => row.country}
              columns={[
                { key: "country", header: "Country", render: (r) => r.country },
                { key: "f1", header: nationalityTable ? "F1 nationals, last 12 months" : "F1, last 12 months", numeric: true, render: (r) => int(r.f1Last12) },
                { key: "j1", header: nationalityTable ? "J1 nationals, last 12 months" : "J1, last 12 months", numeric: true, render: (r) => int(r.j1Last12) },
                { key: "growth", header: "F1 vs previous 12 months", numeric: true, render: (r) => changeText(r.f1Change, r.f1Prior, arrowPct) },
                { key: "post", header: "Top post (issued in)", render: (r) => r.topPost },
                { key: "peak", header: "Peak month (typical year)", render: (r) => r.peakName },
              ]}
            />

            <SubHeading>Downloads</SubHeading>
            <div className="flex flex-wrap gap-2">
              <DownloadCsvButton
                label="Country 360 Summary CSV"
                filename={`qu_country360_summary_${slug}_${periodRange.slug}.csv`}
                headers={[
                  "country", "measure", `f1_total_${periodRange.slug}`, `j1_total_${periodRange.slug}`, `fy${latestFy}_f1`, `fy${latestFy}_j1`,
                  "f1_growth_5yr_pct", "f1_growth_10yr_pct", "top_consulate", "peak_month",
                  "recovery_index", "top_one_share", "top_three_share", "volatility", "data_confidence",
                ]}
                rows={[[
                  country,
                  byNationality ? "nationality" : "issued_in",
                  String(periodF1),
                  String(periodJ1),
                  String(metrics.latestFyF1),
                  String(metrics.latestFyJ1),
                  metrics.growth5 === null ? "" : String(metrics.growth5),
                  metrics.growth10 === null ? "" : String(metrics.growth10),
                  metrics.topConsulate,
                  metrics.leadMetrics.peakMonthName,
                  metrics.leadMetrics.recoveryIndex === null ? "" : String(metrics.leadMetrics.recoveryIndex),
                  metrics.topOneShare === null ? "" : String(metrics.topOneShare),
                  metrics.topThreeShare === null ? "" : String(metrics.topThreeShare),
                  metrics.leadMetrics.volatility,
                  metrics.dataConfidence,
                ]]}
              />
              <DownloadCsvButton
                label="All-country Rankings CSV"
                filename={`qu_country360_rankings_${nationalityTable ? "nationality" : "issued_in"}_last_12_months.csv`}
                headers={[
                  "country", "f1_last_12_months", "j1_last_12_months", "f1_previous_12_months", "f1_change_pct",
                  "top_post_issued_in", "peak_month_typical_year", "Restriction", "Suspended since",
                ]}
                rows={rankings.map((r) => [
                  r.country,
                  String(r.f1Last12),
                  String(r.j1Last12),
                  String(r.f1Prior),
                  r.f1Change === null ? "" : r.f1Change.toFixed(1),
                  r.topPost,
                  r.peakName,
                  ...restrictionCsv(r.country),
                ])}
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
                  lead.length > 0
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
                  Monthly nationality layer:{" "}
                  {byNationality
                    ? `Nationals of ${country}, wherever their visas were issued, ${monthLongDisplay(coverage.postsMonthly.start)}-${monthLongDisplay(endIndex)}; months with no rows count as 0.`
                    : "not available for this country, so the page uses visas issued in it."}
                </li>
                <li>
                  Historical consulate layer (issued in): <code className="font-mono">{monthCountry}</code>{" "}
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

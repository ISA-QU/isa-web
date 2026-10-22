"use client";

import { useMemo } from "react";

import { int, metricPct, monthDisplay, monthLongDisplay } from "../../lib/dashboard/format";
import { idxMaxString } from "../../lib/dashboard/metrics";
import {
  arrowPct,
  countryF1Change,
  monthRangeLabel,
  rollingTwelveMonths,
} from "../../lib/dashboard/rolling";
import { useDashboard } from "./DashboardContext";
import { FixedTag, KpiCard, KpiRow } from "./ui";

const toneOf = (change: number | null) =>
  change === null ? "neutral" : change > 0 ? "pos" : change < 0 ? "neg" : "neutral";

/**
 * The header strip: the latest 12 months of consulate data against the 12
 * months before. It ignores the sidebar's Years filter on purpose, so these
 * figures never change meaning with the filters. Exact figures are in each
 * card's hover tooltip.
 */
export default function HeaderKpis() {
  const { data, focusCountry, consulateCountries } = useDashboard();
  const end = data.meta.coverage.postsMonthly.end;
  const firstMonth = data.meta.coverage.postsMonthly.start;

  const rolling = useMemo(() => rollingTwelveMonths(data.postsMonthly, end), [data.postsMonthly, end]);
  const { current, prior } = rolling;
  const period = monthRangeLabel(current);
  const priorPeriod = monthRangeLabel(prior);
  const comparable = current.complete && prior.complete;

  /** The short line under a value; keeps the "No comparison" fallbacks. */
  const changeLine = (change: number | null, suffix = "") => {
    if (!comparable) return "No comparison: needs 24 complete months of data";
    if (change === null) return `No F1 in ${priorPeriod} to compare with`;
    return `${arrowPct(change)}${suffix}`;
  };

  /** The hover tooltip: both periods, both totals, exact change. */
  const detail = (what: string, now: number, before: number, change: number | null) =>
    [
      `${what}, ${period}: ${int(now)}`,
      `${what}, ${priorPeriod}: ${int(before)}`,
      `Change: ${comparable && change !== null ? metricPct(change) : "not available"}`,
    ].join("\n");

  const topCountry = idxMaxString(current.f1ByCountry);
  const topF1 = topCountry ? (current.f1ByCountry.get(topCountry) ?? 0) : 0;
  const topPrior = topCountry ? (prior.f1ByCountry.get(topCountry) ?? 0) : 0;
  const topShare = current.f1 > 0 ? (topF1 / current.f1) * 100 : null;

  const focusF1 = current.f1ByCountry.get(focusCountry) ?? 0;
  const focusPrior = prior.f1ByCountry.get(focusCountry) ?? 0;
  const focusChange = countryF1Change(rolling, focusCountry);

  return (
    <>
      <h2 className="mb-3 text-sm font-semibold text-slate-200">
        Last 12 months · {period}, compared with the previous 12 months
        <FixedTag title="These cards ignore the Period control.">Always last 12 months</FixedTag>
      </h2>
      <KpiRow>
        <KpiCard
          accent="gold"
          label="Student visas (F1)"
          value={int(current.f1)}
          delta={changeLine(rolling.f1Change, " vs previous 12 months")}
          deltaTone={toneOf(rolling.f1Change)}
          title={detail("F1 issuances", current.f1, prior.f1, rolling.f1Change)}
        />
        <KpiCard
          accent="navy"
          label="Exchange visas (J1)"
          value={int(current.j1)}
          delta={changeLine(rolling.j1Change, " vs previous 12 months")}
          deltaTone={toneOf(rolling.j1Change)}
          title={detail("J1 issuances", current.j1, prior.j1, rolling.j1Change)}
        />
        <KpiCard
          label="Most F1 visas issued in"
          value={topCountry ?? "N/A"}
          valueClassName="!text-[18px]"
          delta={
            topCountry
              ? `${int(topF1)}${topShare !== null ? ` · ${Math.round(topShare)}% of all F1` : ""}`
              : "No F1 issuances in this period"
          }
          title={
            topCountry
              ? [
                  detail(`F1 issued in ${topCountry}`, topF1, topPrior, countryF1Change(rolling, topCountry)),
                  `Share of all F1, ${period}: ${topShare !== null ? `${topShare.toFixed(1)}%` : "N/A"}`,
                ].join("\n")
              : undefined
          }
        />
        <KpiCard
          accent="gold"
          label={`Focus: ${focusCountry}`}
          value={consulateCountries.has(focusCountry) ? int(focusF1) : "—"}
          delta={
            consulateCountries.has(focusCountry)
              ? `F1 issued in ${focusCountry} · ${changeLine(focusChange)}`
              : `No consulate data for ${focusCountry}`
          }
          deltaTone={toneOf(focusChange)}
          title={detail(`F1 issued in ${focusCountry}`, focusF1, focusPrior, focusChange)}
        />
        <KpiCard
          accent="navy"
          label="Data through"
          value={monthLongDisplay(end)}
          valueClassName="!text-[18px]"
          delta={`Updated monthly · since ${monthDisplay(firstMonth)}`}
          title={[
            `Monthly consulate data, ${monthRangeLabel({ start: firstMonth, end })}`,
            `Latest 12 months: ${period}`,
            `Previous 12 months: ${priorPeriod}`,
          ].join("\n")}
        />
      </KpiRow>
      <p className="-mt-4 mb-7 text-xs text-slate-400">
        Country = where the visa was issued, not student nationality. These figures ignore the
        Period control.
      </p>
    </>
  );
}

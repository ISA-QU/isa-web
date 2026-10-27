"use client";

import { useMemo, useState } from "react";

import { MARKET_CATEGORIES, MONTH_NAMES_FULL } from "../../../lib/dashboard/constants";
import { previousPeriod } from "../../../lib/dashboard/consulates";
import { decimals, int, metricNumber, monthDisplay } from "../../../lib/dashboard/format";
import { LOW_VOLUME, MIN_BASE, changeText, changeVsBase, latestCompleteYearOf } from "../../../lib/dashboard/measures";
import {
  MARKET_THRESHOLDS,
  buildCommandCenterFrame,
  nationalitySignals,
  notNa,
  recommendedOutreachWindow,
} from "../../../lib/dashboard/metrics";
import { MOVER_MIN_ISSUANCES, arrowPct, monthRangeLabel } from "../../../lib/dashboard/rolling";
import { restrictionCsv } from "../../../lib/dashboard/restrictions";
import { sortBy } from "../../../lib/dashboard/sort";
import type { CommandCenterRow } from "../../../lib/dashboard/types";
import { useDashboard, visaLabelOf } from "../DashboardContext";
import RestrictionBadges, { RestrictionSmallPrint } from "../RestrictionBadges";
import { Caption, DownloadCsvButton, InfoCallout, SubHeading } from "../shared";
import { Column, DataTable, Expander, FixedTag, KpiCard, KpiRow, Panel, Select, Slider } from "../ui";

/** How the main table is sorted. */
const SORTS = ["Nationals", "Change", "10-year trend"] as const;
type SortKey = (typeof SORTS)[number];

/** A market row: the shared nationality row (or the issued-in fallback) plus its Period figures. */
type MarketRow = CommandCenterRow & {
  hideTiming?: boolean;
  periodTotal: number;
  periodPrior: number | null;
  periodChange: number | null;
};

const T = MARKET_THRESHOLDS;

/** Months from `fromMonth` (1–12) forward to `month`: 0 = this month. */
const monthsAhead = (month: number, fromMonth: number) => (month - fromMonth + 12) % 12;

/**
 * Markets (8-3, formerly the Command Center): every country by nationality,
 * from the same rows as Country 360's "What to do" (nationalitySignals), so the
 * two pages agree. Falls back to where visas were issued, with a banner, when
 * the snapshot has no nationality table.
 */
export default function MarketsTab() {
  const { data, visa, periodRange, allCountries } = useDashboard();
  const { coverage } = data.meta;
  const nationality = data.nationalityMonthly;
  const byNationality = nationality !== null;
  const visaLabel = visaLabelOf(visa);
  const visas = visa === "Both" ? ["F1", "J1"] : [visa];

  const [region, setRegion] = useState("All");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("Nationals");
  const [minNationals, setMinNationals] = useState<number>(MIN_BASE);

  /* ---- One row per country: the shared rules, nothing computed separately here ---- */
  const signals = useMemo((): CommandCenterRow[] => {
    if (nationality) {
      const control = new Set(allCountries);
      const countries = [...new Set(nationality.filter((r) => r.isCountry && control.has(r.country)).map((r) => r.country))];
      return countries
        .map((c) =>
          nationalitySignals(
            nationality,
            data.annualCountry,
            c,
            visa,
            coverage.annual.latestComplete,
            coverage.postsMonthly,
            coverage.operational,
          ),
        )
        .filter((r): r is NonNullable<typeof r> => r !== null);
    }
    return buildCommandCenterFrame(
      data.operational,
      data.annualCountry,
      data.postsMonthly,
      visa,
      coverage.annual.latestComplete,
      coverage.postsMonthly,
    );
  }, [nationality, allCountries, data.annualCountry, data.operational, data.postsMonthly, visa, coverage]);

  // The Period columns: nationals in the Period and the change vs the previous period of equal length.
  const priorRange = previousPeriod(periodRange, coverage.postsMonthly);
  const rows = useMemo((): MarketRow[] => {
    const now = new Map<string, number>();
    const before = new Map<string, number>();
    const source: readonly { country: string; visa: string; monthIndex: number; issuances: number }[] =
      nationality ? nationality.filter((r) => r.isCountry) : data.postsMonthly;
    for (const r of source) {
      if (!visas.includes(r.visa)) continue;
      if (r.monthIndex >= periodRange.start && r.monthIndex <= periodRange.end) {
        now.set(r.country, (now.get(r.country) ?? 0) + r.issuances);
      } else if (priorRange && r.monthIndex >= priorRange.start && r.monthIndex <= priorRange.end) {
        before.set(r.country, (before.get(r.country) ?? 0) + r.issuances);
      }
    }
    return signals.map((r) => {
      const periodTotal = now.get(r.country) ?? 0;
      const periodPrior = priorRange ? (before.get(r.country) ?? 0) : null;
      return {
        ...r,
        periodTotal,
        periodPrior,
        periodChange: periodPrior === null ? null : changeVsBase(periodTotal, periodPrior),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, nationality, data.postsMonthly, visa, periodRange, priorRange?.start, priorRange?.end]);

  const regionOptions = useMemo(() => ["All", ...[...new Set(rows.map((r) => r.region))].sort()], [rows]);
  const maxNationals = useMemo(() => Math.max(1000, ...rows.map((r) => r.latest12Total)), [rows]);

  // Region and minimum first (the category counts use these), then the category.
  const inScope = useMemo(
    () => rows.filter((r) => r.latest12Total >= minNationals && (region === "All" || r.region === region)),
    [rows, minNationals, region],
  );
  const filtered = useMemo(() => {
    const scoped = category === "All" ? inScope : inScope.filter((r) => r.marketCategory === category);
    if (sort === "Change") return sortBy(scoped, [(r) => r.periodChange, (r) => r.periodTotal]);
    if (sort === "10-year trend") return sortBy(scoped, [(r) => r.growth10yr, (r) => r.periodTotal]);
    return sortBy(scoped, [(r) => r.periodTotal, (r) => r.latest12Total]);
  }, [inScope, category, sort]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of inScope) counts.set(r.marketCategory, (counts.get(r.marketCategory) ?? 0) + 1);
    return counts;
  }, [inScope]);

  const end = coverage.postsMonthly.end;
  const last12 = monthRangeLabel({ start: end - 11, end });
  const latestFy = coverage.annual.latestComplete;
  const tenYear = latestFy !== null ? `FY${latestFy - 10} → FY${latestFy}` : "10-year";
  const recoveryYear = latestCompleteYearOf(coverage.postsMonthly);
  const measure = byNationality ? "nationals" : "issued";
  const changeHeader = priorRange ? `Change vs ${monthRangeLabel(priorRange)}` : "Change vs previous period";
  const periodChangeText = (r: MarketRow) =>
    r.periodPrior === null ? "—" : changeText(r.periodChange, r.periodPrior, arrowPct);
  const timingText = (r: MarketRow) => (r.hideTiming || !r.timing ? "—" : r.timing);
  const rowKey = (r: { country: string }) => r.country;

  const countryCell = (r: MarketRow) => (
    <>
      {r.country}
      <RestrictionBadges country={r.country} compact />
    </>
  );

  /* ---- Main table: six columns ---- */
  const mainColumns: Column<MarketRow>[] = [
    { key: "country", header: "Country", render: countryCell },
    { key: "nationals", header: `${byNationality ? "Nationals" : "Issued"}, ${periodRange.label}`, numeric: true, render: (r) => int(r.periodTotal) },
    { key: "change", header: changeHeader, numeric: true, render: periodChangeText },
    { key: "trend", header: `10-year trend, ${tenYear}`, numeric: true, render: (r) => arrowPct(r.growth10yr) },
    {
      key: "action",
      header: "Action (category)",
      // Restricted and restored advice already starts with its category.
      render: (r) =>
        r.recommendedAction.startsWith(`${r.marketCategory} `) ? (
          r.recommendedAction
        ) : (
          <>
            {r.recommendedAction} <span className="text-slate-400">({r.marketCategory})</span>
          </>
        ),
    },
    { key: "timing", header: "Timing", render: timingText },
  ];

  /* ---- More details: every column ---- */
  const peakText = (r: MarketRow) => (r.peakMonth ? r.peakMonthName : r.peakMonthName || "N/A");
  const recoveryText = (r: MarketRow) =>
    notNa(r.recoveryIndex) ? r.recoveryIndex.toFixed(0) : r.hasConsulateData ? LOW_VOLUME : "N/A";
  const detailColumns: Column<MarketRow>[] = [
    { key: "country", header: "Country", render: countryCell },
    { key: "category", header: "Category", render: (r) => r.marketCategory },
    { key: "l12", header: `Last 12 months (${last12})`, numeric: true, render: (r) => int(r.latest12Total) },
    { key: "p12", header: "Previous 12 months", numeric: true, render: (r) => int(r.prior12Total) },
    { key: "m12", header: "Change, last 12 months", numeric: true, render: (r) => changeText(r.latest12Momentum, r.prior12Total, arrowPct) },
    { key: "rec", header: `Recovery (${recoveryYear} vs 2019)`, numeric: true, render: recoveryText },
    { key: "g5", header: "5-year trend", numeric: true, render: (r) => arrowPct(r.growth5yr) },
    { key: "peak", header: "Peak month (typical year)", render: peakText },
    { key: "season", header: "Seasonality ratio", numeric: true, render: (r) => (notNa(r.seasonalityRatio) ? `${r.seasonalityRatio.toFixed(1)}x` : "—") },
    { key: "cv", header: "Volatility CV", numeric: true, render: (r) => decimals(r.volatilityCv, 2) },
    { key: "flags", header: "Flags", render: (r) => r.secondaryFlags.join(", ") || "—" },
    { key: "why", header: "Why", render: (r) => r.primaryDriver },
    { key: "but", header: "But", render: (r) => r.counterSignal },
    { key: "confidence", header: "Confidence", render: (r) => r.confidence },
    { key: "caveat", header: "Caveat", render: (r) => r.caveat },
    { key: "evidence", header: "Evidence", render: (r) => r.evidence },
  ];

  const csvHeaders = [
    "country", "category", "action", "timing", `${measure}_${periodRange.slug}`, "previous_period", "change_pct",
    "ten_year_trend_pct", `${measure}_last_12_months`, "previous_12_months", "change_last_12_months_pct",
    "recovery_index", "five_year_trend_pct", "peak_month_typical_year", "seasonality_ratio", "volatility_cv",
    "flags", "why", "but", "confidence", "Restriction", "Suspended since",
  ];
  const csvRows = filtered.map((r) => [
    r.country,
    r.marketCategory,
    r.recommendedAction,
    timingText(r),
    String(r.periodTotal),
    r.periodPrior === null ? "" : String(r.periodPrior),
    r.periodChange === null ? "" : r.periodChange.toFixed(1),
    r.growth10yr === null ? "" : r.growth10yr.toFixed(1),
    String(r.latest12Total),
    String(r.prior12Total),
    r.latest12Momentum === null ? "" : r.latest12Momentum.toFixed(1),
    r.recoveryIndex === null ? "" : r.recoveryIndex.toFixed(1),
    r.growth5yr === null ? "" : r.growth5yr.toFixed(1),
    r.peakMonthName,
    r.seasonalityRatio === null ? "" : r.seasonalityRatio.toFixed(2),
    r.volatilityCv === null ? "" : r.volatilityCv.toFixed(3),
    r.secondaryFlags.join("; "),
    r.primaryDriver,
    r.counterSignal,
    r.confidence,
    ...restrictionCsv(r.country),
  ]);

  /* ---- Travel timing: next outreach window first, from this month ---- */
  const thisMonth = new Date().getMonth() + 1;
  const travel = useMemo(() => {
    const eligible = inScope.filter(
      (r) =>
        r.marketCategory !== "Restricted" &&
        !r.hideTiming &&
        notNa(r.peakMonth) &&
        r.latest12Total >= 500 &&
        (category === "All" || r.marketCategory === category),
    );
    // The outreach window starts four months before the peak.
    const start = (r: MarketRow) => ((((r.peakMonth as number) - 5) % 12) + 12) % 12 + 1;
    return [...eligible].sort(
      (a, b) =>
        monthsAhead(start(a), thisMonth) - monthsAhead(start(b), thisMonth) ||
        b.latest12Total - a.latest12Total,
    );
  }, [inScope, category, thisMonth]);

  /* ---- 12-month movers, by the same measure ---- */
  const moverPool = inScope.filter(
    (r) => r.latest12Momentum !== null && r.latest12Total >= MOVER_MIN_ISSUANCES && r.prior12Total >= MOVER_MIN_ISSUANCES,
  );
  const risers = sortBy(moverPool.filter((r) => r.latest12Momentum! > 0), [(r) => r.latest12Momentum]).slice(0, 10);
  const fallers = sortBy(moverPool.filter((r) => r.latest12Momentum! < 0), [(r) => r.latest12Momentum], true).slice(0, 10);
  const moverColumns: Column<MarketRow>[] = [
    { key: "country", header: "Country", render: countryCell },
    { key: "change", header: "Change vs previous 12 months", numeric: true, render: (r) => arrowPct(r.latest12Momentum) },
    { key: "latest", header: "Last 12 months", numeric: true, render: (r) => int(r.latest12Total) },
    { key: "prior", header: "Previous 12 months", numeric: true, render: (r) => int(r.prior12Total) },
    { key: "action", header: "Action", render: (r) => r.recommendedAction },
  ];

  const countCard = (name: string) => {
    const n = categoryCounts.get(name) ?? 0;
    return (
      <KpiCard
        key={name}
        accent={name === "Core" ? "gold" : name === "Restricted" ? "navy" : "default"}
        label={name}
        value={metricNumber(n)}
        delta={name === "Emerging" && n === 0 ? "None in the last 12 months" : undefined}
      />
    );
  };

  return (
    <div className="space-y-6">
      <Panel accent="navy">
        <h4 className="mb-1 text-base font-bold text-white">Where should Quinnipiac focus recruitment, and why?</h4>
        <p className="text-sm leading-relaxed text-[#DDEBFA]">
          {byNationality
            ? "Every country by nationality (the passport the visa was issued to), the same measure and the same advice as Country 360."
            : "Monthly nationality data isn't in this data snapshot, so Markets counts visas by the country where they were issued."}{" "}
          {visaLabel} visas.
        </p>
      </Panel>

      <p className="text-xs text-slate-400">
        <FixedTag title="These two columns follow the Period control.">Follows Period</FixedTag> Nationals and change:{" "}
        {periodRange.label}
        {priorRange ? ` vs ${monthRangeLabel(priorRange)}` : " (no previous period of the same length)"}.{" "}
        <FixedTag title="These ignore the Period control.">Fixed</FixedTag> 10-year trend: {tenYear} by nationality ·
        category, action, flags and movers: last 12 months ({last12}) · timing: typical year.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Select label="Region" value={region} options={regionOptions} onChange={setRegion} />
        <Select label="Category" value={category} options={["All", ...MARKET_CATEGORIES]} onChange={setCategory} />
        <Select label="Sort by" value={sort} options={SORTS} onChange={(v) => setSort(v as SortKey)} />
        <Slider
          label="Minimum nationals, last 12 months"
          value={minNationals}
          min={0}
          max={maxNationals}
          step={100}
          onChange={setMinNationals}
          format={int}
        />
      </div>

      <KpiRow>
        {MARKET_CATEGORIES.map(countCard)}
        <KpiCard accent="gold" label="Data through" value={monthDisplay(end)} valueClassName="!text-[18px]" />
      </KpiRow>

      <section>
        <SubHeading>Markets</SubHeading>
        <DataTable
          rows={filtered}
          columns={mainColumns}
          height={480}
          rowKey={rowKey}
          empty={category === "Emerging" ? "None in the last 12 months." : "No markets match the selected filters."}
        />
        <DownloadCsvButton
          label="Download markets CSV"
          filename={`qu_markets_${visa.toLowerCase()}_${periodRange.slug}.csv`}
          headers={csvHeaders}
          rows={csvRows}
        />
        <div className="mt-2">
          <RestrictionSmallPrint />
        </div>
      </section>

      <section>
        <SubHeading>
          Travel Timing Opportunities
          <FixedTag title="Typical-year peak; ordered from this month.">Next outreach window first</FixedTag>
        </SubHeading>
        <Caption>
          Markets with at least 500 {measure} in the last 12 months and timing advice (not restricted),
          ordered by the next outreach window from {MONTH_NAMES_FULL[thisMonth]}.
        </Caption>
        <DataTable
          rows={travel}
          height={380}
          rowKey={rowKey}
          columns={[
            { key: "country", header: "Country", render: countryCell },
            { key: "window", header: "Outreach window", render: (r) => recommendedOutreachWindow(r.peakMonth) },
            { key: "peak", header: "Peak month (typical year)", render: (r) => r.peakMonthName },
            { key: "volume", header: `Last 12 months (${last12})`, numeric: true, render: (r) => int(r.latest12Total) },
            { key: "category", header: "Category", render: (r) => r.marketCategory },
          ]}
          empty="No market with timing advice matches the selected filters."
        />
      </section>

      <section>
        <SubHeading>Latest 12-Month Movers</SubHeading>
        <Caption>
          {visaLabel} visas {byNationality ? "by nationality" : "by country where issued"}, {last12} vs the previous 12
          months. Only countries with at least {MOVER_MIN_ISSUANCES} in both 12-month periods ({moverPool.length} match the
          current filters).
        </Caption>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h5 className="mb-2 text-sm font-bold text-[#4ade80]">Top risers</h5>
            <DataTable rows={risers} height={390} rowKey={rowKey} columns={moverColumns} empty="No qualifying country grew." />
          </div>
          <div>
            <h5 className="mb-2 text-sm font-bold text-[#f87171]">Top fallers</h5>
            <DataTable rows={fallers} height={390} rowKey={rowKey} columns={moverColumns} empty="No qualifying country declined." />
          </div>
        </div>
      </section>

      <Expander title="More details">
        <DataTable rows={filtered} columns={detailColumns} height={460} rowKey={rowKey} />
        <Expander title="Threshold definitions">
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>Restricted (checked first): student and exchange visas suspended by a travel ban, or U.S. visa services paused (see the badges and their sources).</li>
            <li>Restored: student and exchange visas suspended earlier and since restored (Turkmenistan); shown as Watch with timing hidden, since the recent fall reflects the suspension.</li>
            <li>
              Core: {int(T.core)}+ in the last 12 months, not structurally declining. Declining: 10-year trend ≤{" "}
              {T.structuralGrowth}% and last-12-month change ≤ {T.structuralMomentum}%, with {T.declineMinPrior}+ in the
              previous 12 months; also any market that fell below {MIN_BASE} from {MIN_BASE}+.
            </li>
            <li>
              Emerging: change ≥ +{T.emergingMomentum}% with {T.emergingMin}–{int(T.core - 1)} in the last 12 months.
              Growth: 10-year trend ≥ +{T.growthTenYear}% with {T.growthMin}+. Recovery: {recoveryYear} vs 2019 ≥{" "}
              {T.recoveryIndex} with {T.recoveryMin}+. Watch: everything else.
            </li>
            <li>
              Flags (only from {T.flagMin} in the last 12 months; below that, Low Confidence): Highly Seasonal = peak month ≥{" "}
              {T.seasonalRatio.toFixed(1)}x the average month; Volatile = monthly CV ≥ {T.volatileCv}; Weak Recent Momentum ={" "}
              {T.weakMomentum}% or worse (falling faster than all F1 nationals); Strong Long-Term Growth = 10-year trend ≥ +
              {T.strongGrowth}%; Recovery Leader = recovery ≥ {T.recoveryIndex}.
            </li>
            <li>One set of thresholds for F1, J1 and F1 + J1.</li>
          </ul>
        </Expander>
      </Expander>

      {!byNationality && (
        <InfoCallout>Markets falls back to where visas were issued until monthly nationality data is available.</InfoCallout>
      )}
    </div>
  );
}

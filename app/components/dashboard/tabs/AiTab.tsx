"use client";

import { useMemo, useState } from "react";

import { GROWTH_LABEL, MONTH_NAMES_FULL } from "../../../lib/dashboard/constants";
import { int, metricPct } from "../../../lib/dashboard/format";
import {
  groupSum,
  idxMaxNumeric,
  marketTier,
  notNa,
  opportunityScore,
  seasonalityCv,
  sumBy,
  yoyGrowth,
} from "../../../lib/dashboard/metrics";
import { useDashboard } from "../DashboardContext";
import { InfoCallout, SubHeading } from "../shared";
import { KpiCard, KpiRow, Panel, Select, SectionTitle, Divider } from "../ui";

export default function AiTab() {
  const { f1, j1, summary, countries, focusCountry } = useDashboard();
  const [country, setCountry] = useState(focusCountry);
  const [attempted, setAttempted] = useState(false);

  const metrics = useMemo(() => {
    const cf1 = f1.filter((r) => r.country === country);
    const total = sumBy(cf1, (r) => r.issuances);
    const growth = yoyGrowth(cf1);
    const cv = seasonalityCv(cf1);
    const monthTotals = groupSum(cf1, (r) => r.month, (r) => r.issuances);
    return {
      total,
      j1Total: sumBy(j1.filter((r) => r.country === country), (r) => r.issuances),
      growth,
      cv,
      tier: marketTier(total),
      opportunity: opportunityScore(total, growth, cv),
      peakMonth: cf1.length > 0 ? (idxMaxNumeric(monthTotals) ?? 0) : 0,
    };
  }, [f1, j1, country]);

  const snapshots = summary.slice(0, 12);

  return (
    <div className="space-y-6">
      <SectionTitle>AI-Powered Admissions Insights</SectionTitle>

      <Panel accent="navy">
        <p className="leading-relaxed text-[#CBD5E1]">
          Generate a data-grounded executive summary from the visa issuance data. If no Anthropic key
          is configured, the dashboard still provides deterministic market snapshot cards below.
        </p>
      </Panel>

      <Select
        label="Select country for AI analysis"
        value={country}
        options={countries}
        onChange={setCountry}
      />

      <KpiRow>
        <KpiCard label="F1 Total" value={int(metrics.total)} />
        <KpiCard label="J1 Total" value={int(metrics.j1Total)} />
        <KpiCard label={GROWTH_LABEL} value={metricPct(metrics.growth)} />
        <KpiCard label="Opp. Score" value={`${metrics.opportunity}/100`} />
      </KpiRow>

      <div>
        <button
          type="button"
          onClick={() => setAttempted(true)}
          className="rounded-md bg-[#FFB81C] px-4 py-2 text-sm font-semibold text-[#0C2340] transition hover:bg-[#ffc74d] focus:outline-none focus:ring-2 focus:ring-white/40"
        >
          Generate AI Insights
        </button>

        {attempted && (
          <div className="mt-3 space-y-2">
            <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-200">
              AI generation failed: no briefing service is configured.
            </div>
            <InfoCallout>
              Live generation needs an Anthropic API key. On a static site the key cannot live in the
              browser, so this call has to go through a Lambda proxy — that endpoint has not been set
              up yet. Every deterministic figure on this tab is unaffected.
            </InfoCallout>
          </div>
        )}
      </div>

      <Divider />

      <section>
        <SubHeading>Automated Market Snapshot Cards</SubHeading>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {snapshots.map((row) => {
            const growthTone = notNa(row.growthPct)
              ? row.growthPct > 0
                ? "text-[#4ADE80]"
                : row.growthPct < -5
                  ? "text-[#F87171]"
                  : "text-[#FFB81C]"
              : "text-[#FFB81C]";
            const peak = row.peakMonth ? (MONTH_NAMES_FULL[row.peakMonth] ?? "N/A") : "N/A";

            return (
              <div
                key={row.country}
                className="rounded-lg border border-slate-400/20 bg-[linear-gradient(180deg,rgba(14,37,76,0.92),rgba(5,16,34,0.88))] p-5"
              >
                <div className="text-base font-extrabold text-white">{row.country}</div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-[#7FA8C9]">
                  {row.tier.split("—")[0].trim()}
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-[#94A3B8]">F1 Total</dt>
                    <dd className="font-bold text-white">{int(row.f1Total)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#94A3B8]">{GROWTH_LABEL}</dt>
                    <dd className={`font-bold ${growthTone}`}>{metricPct(row.growthPct)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#94A3B8]">Opp. Score</dt>
                    <dd className="font-extrabold text-[#FFB81C]">{row.opportunityScore}/100</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#94A3B8]">Peak Month</dt>
                    <dd className="text-[#93C5FD]">{peak}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

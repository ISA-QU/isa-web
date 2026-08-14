"use client";

import { GROWTH_LABEL, MONTH_NAMES_FULL } from "../../../lib/dashboard/constants";
import { int, metricPct } from "../../../lib/dashboard/format";
import { notNa } from "../../../lib/dashboard/metrics";
import type { CountrySummaryRow } from "../../../lib/dashboard/types";
import { useDashboard } from "../DashboardContext";
import { InfoCallout, SubHeading } from "../shared";
import { DataTable, Divider, InsightChip, Panel, ScopeNote, SectionTitle } from "../ui";

export default function StrategyTab() {
  const { focusCountry, focus, summary } = useDashboard();

  const tierKey = focus.tier.split("—")[0].trim();
  const peak = focus.peakMonth ? (MONTH_NAMES_FULL[focus.peakMonth] ?? "N/A") : "N/A";
  const growth = focus.growth;

  let trendMessage: string;
  let trendChip: string;
  if (notNa(growth) && growth >= 15) {
    trendMessage = `Accelerating Market - F1 issuances show ${metricPct(growth)} ${GROWTH_LABEL}. Increase QU recruitment investment.`;
    trendChip = "High Growth";
  } else if (notNa(growth) && growth >= 0) {
    trendMessage = `Stable Market - Moderate ${metricPct(growth)} ${GROWTH_LABEL}. Maintain engagement and monitor for acceleration.`;
    trendChip = "Stable";
  } else if (notNa(growth) && growth < -10) {
    trendMessage = `Declining Market - F1 issuances are down ${Math.abs(growth).toFixed(1)}% on ${GROWTH_LABEL}. Review investment before scaling.`;
    trendChip = "Declining";
  } else {
    trendMessage = "Monitor Market - comparable growth data is limited.";
    trendChip = "Monitor";
  }

  const seasonMessage =
    focus.cv && focus.cv >= 0.6
      ? `Plan campaigns to peak before ${peak}.`
      : "Recruiting windows are relatively flexible year-round.";

  const opportunity = [...summary]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 20);

  const declining = summary
    .filter((row) => notNa(row.growthPct) && row.growthPct < -10)
    .sort((a, b) => (a.growthPct ?? 0) - (b.growthPct ?? 0));

  const stat = (label: string, value: string, className = "text-white") => (
    <div>
      <span className="text-[11px] uppercase tracking-wide text-[#7FA8C9]">{label}</span>
      <div className={`font-semibold ${className}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <ScopeNote label="Legacy Strategy View">
        This page preserves the original country-level strategy console.
      </ScopeNote>

      <SectionTitle>Recruitment Strategy Console</SectionTitle>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Panel accent="gold">
          <h4 className="mb-3 font-serif text-xl text-[#FFB81C]">{focusCountry}</h4>
          <div className="grid gap-2.5">
            {stat("Market Tier", focus.tier, "text-[#FFB81C]")}
            <div>
              <span className="text-[11px] uppercase tracking-wide text-[#7FA8C9]">
                Opportunity Score
              </span>
              <div className="text-[22px] font-extrabold text-white">{focus.opportunity} / 100</div>
            </div>
            {stat("F1 Total", int(focus.total))}
            {stat(
              GROWTH_LABEL,
              notNa(growth) ? metricPct(growth) : "Insufficient data",
              (growth ?? 0) > 0 ? "text-[#4ADE80]" : "text-[#F87171]",
            )}
            {stat("Peak F1 Month", peak, "text-[#FFB81C]")}
            {stat("Top Consulate", focus.topPost)}
          </div>
        </Panel>

        <Panel accent="navy">
          <h4 className="mb-3 font-serif text-xl text-[#93C5FD]">Strategy Recommendations</h4>
          <div className="mb-3">
            <InsightChip tone={trendChip === "High Growth" ? "gold" : "default"}>
              {trendChip}
            </InsightChip>
            <InsightChip tone="gold">{tierKey}</InsightChip>
            <InsightChip>Peak: {peak}</InsightChip>
          </div>
          <p className="leading-relaxed text-[#CBD5E1]">{trendMessage}</p>
          <p className="mt-2 leading-relaxed text-[#CBD5E1]">{seasonMessage}</p>
          <p className="mt-2 leading-relaxed text-[#CBD5E1]">
            <b>Top Consulate to Monitor:</b>{" "}
            <span className="text-[#FFB81C]">{focus.topPost}</span>.
          </p>
          <p className="mt-3 border-t border-white/10 pt-2.5 text-xs text-[#94A3B8]">
            Visa issuance volume reflects student mobility, not individual approval probability. Use
            as directional signal only.
          </p>
        </Panel>
      </div>

      <Divider />

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <SubHeading>Top Opportunity Markets</SubHeading>
          <DataTable<CountrySummaryRow>
            rows={opportunity}
            height={360}
            rowKey={(row) => row.country}
            columns={[
              { key: "country", header: "Country", render: (r) => r.country },
              { key: "f1", header: "F1 Total", numeric: true, render: (r) => int(r.f1Total) },
              { key: "growth", header: GROWTH_LABEL, numeric: true, render: (r) => metricPct(r.growthPct) },
              { key: "tier", header: "Tier", render: (r) => r.tier },
              { key: "score", header: "Score", numeric: true, render: (r) => r.opportunityScore },
              {
                key: "peak",
                header: "Peak Month",
                render: (r) => MONTH_NAMES_FULL[r.peakMonth] ?? "N/A",
              },
            ]}
          />
        </section>

        <section>
          <SubHeading>Declining Markets - Alert List</SubHeading>
          {declining.length > 0 ? (
            <DataTable<CountrySummaryRow>
              rows={declining}
              height={360}
              rowKey={(row) => row.country}
              columns={[
                { key: "country", header: "Country", render: (r) => r.country },
                { key: "f1", header: "F1 Total", numeric: true, render: (r) => int(r.f1Total) },
                { key: "growth", header: GROWTH_LABEL, numeric: true, render: (r) => metricPct(r.growthPct) },
                { key: "tier", header: "Tier", render: (r) => r.tier },
              ]}
            />
          ) : (
            <InfoCallout>No significantly declining markets in the selected period.</InfoCallout>
          )}
        </section>
      </div>
    </div>
  );
}

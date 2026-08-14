"use client";

import { GROWTH_LABEL } from "../../lib/dashboard/constants";
import { int, metricPct } from "../../lib/dashboard/format";
import { groupSum, idxMaxString, sumBy, yoyGrowth } from "../../lib/dashboard/metrics";
import { useDashboard } from "./DashboardContext";
import { KpiCard, KpiRow } from "./ui";

/** The six-card KPI strip above the tabs (app.py lines 1177-1201). */
export default function HeaderKpis() {
  const { f1Filtered, j1Filtered, focusCountry, focus } = useDashboard();

  const totalF1 = sumBy(f1Filtered, (r) => r.issuances);
  const totalJ1 = sumBy(j1Filtered, (r) => r.issuances);
  const topCountry =
    idxMaxString(groupSum(f1Filtered, (r) => r.country, (r) => r.issuances)) ?? "N/A";
  const topPost = idxMaxString(groupSum(f1Filtered, (r) => r.post, (r) => r.issuances)) ?? "N/A";
  const globalGrowth = yoyGrowth(f1Filtered);

  // app.py treats a null growth as non-positive, so the delta reads "neg".
  const globalTone = (globalGrowth ?? 0) > 0 ? "pos" : "neg";
  const focusTone = (focus.growth ?? 0) > 0 ? "pos" : "neg";

  const globalDelta =
    globalGrowth !== null ? `${metricPct(globalGrowth)} ${GROWTH_LABEL}` : "N/A";
  const focusDelta = focus.growth !== null ? `${metricPct(focus.growth)} ${GROWTH_LABEL}` : "N/A";
  const tierShort = focus.tier.split("—")[0].trim();

  return (
    <KpiRow>
      <KpiCard
        accent="gold"
        label="Total F1 Issuances"
        value={int(totalF1)}
        delta={globalDelta}
        deltaTone={globalTone}
      />
      <KpiCard accent="navy" label="Total J1 Issuances" value={int(totalJ1)} />
      <KpiCard label="#1 F1 Country" value={topCountry} valueClassName="!text-[18px]" />
      <KpiCard label="#1 F1 Consulate" value={topPost} valueClassName="!text-[18px]" />
      <KpiCard
        accent="gold"
        label="Focus Country"
        value={focusCountry}
        valueClassName="!text-[18px]"
        delta={`${focusDelta} · ${tierShort}`}
        deltaTone={focusTone}
      />
      <KpiCard accent="navy" label="Opp. Score /100" value={focus.opportunity} />
    </KpiRow>
  );
}

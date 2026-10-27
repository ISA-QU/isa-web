"use client";

import {
  pausedPostRestriction,
  pausedPostText,
  RESTRICTION_SMALL_PRINT,
  restrictionBadgeText,
  restrictionShortLabel,
  restrictionsFor,
  restrictionTooltip,
  type Restriction,
} from "../../lib/dashboard/restrictions";

/** Red = full travel ban; amber = partial (F, M, J suspended); purple = temporary pause; grey = F, M, J not affected. */
const TONE: Record<string, string> = {
  full: "border-red-400/50 bg-red-500/15 text-red-200",
  partial: "border-amber-400/50 bg-amber-500/15 text-amber-200",
  temporary: "border-purple-400/50 bg-purple-500/15 text-purple-200",
  "immigrant-only": "border-slate-400/40 bg-white/[0.05] text-slate-300",
};

function Badge({ restriction, compact }: { restriction: Restriction; compact?: boolean }) {
  const text = restrictionBadgeText(restriction);
  return (
    <span
      title={`${text}\n${restrictionTooltip(restriction)}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 align-middle font-semibold ${
        compact ? "text-[10px]" : "text-xs"
      } ${TONE[restriction.level]}`}
    >
      {compact ? restrictionShortLabel(restriction) : text}
    </span>
  );
}

/**
 * The country's visa-restriction badges, if any. `compact` shows short labels for
 * table cells (the full text and source are in the tooltip).
 */
export default function RestrictionBadges({ country, compact = false }: { country: string; compact?: boolean }) {
  const restrictions = restrictionsFor(country);
  if (restrictions.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${compact ? "ml-1.5" : ""}`}>
      {restrictions.map((r) => (
        <Badge key={`${r.type}-${r.level}`} restriction={r} compact={compact} />
      ))}
    </span>
  );
}

/** A purple badge for a consulate where all U.S. visa services are paused (Consulates page). */
export function PausedPostBadge({ post, compact = false }: { post: string; compact?: boolean }) {
  const text = pausedPostText(post);
  const restriction = pausedPostRestriction(post);
  if (!text || !restriction) return null;
  return (
    <span
      title={`${text}\n${restrictionTooltip(restriction)}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 align-middle font-semibold ${
        compact ? "ml-1.5 text-[10px]" : "text-xs"
      } ${TONE.temporary}`}
    >
      {compact ? "Paused" : text}
    </span>
  );
}

/** The small print shown on Country 360 and Markets. */
export function RestrictionSmallPrint() {
  return <p className="text-[11px] leading-relaxed text-slate-500">{RESTRICTION_SMALL_PRINT}</p>;
}

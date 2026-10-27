"use client";

import { eventDateText, type EventOverlay } from "../../lib/dashboard/events";
import { useDashboard } from "./DashboardContext";

/** The "Show events" checkbox; every chart's checkbox shares one setting (and the events= link setting). */
export function EventsToggle() {
  const { showEvents, setShowEvents } = useDashboard();
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-[#A78BFA]"
        checked={showEvents}
        onChange={(event) => setShowEvents(event.target.checked)}
      />
      Show events
      {showEvents && <span className="ml-2 text-[11px] text-violet-300">┆ events — hover ◆ for details</span>}
    </label>
  );
}

/**
 * The chart's events, collapsed by default: date, label, description and a
 * clickable source, then any events after the chart's range (listed, not drawn).
 */
export function EventsList({ overlay }: { overlay: EventOverlay }) {
  const { showEvents } = useDashboard();
  if (!showEvents || (overlay.shown.length === 0 && overlay.later.length === 0)) return null;
  return (
    <details className="group mt-2 rounded-md border border-violet-300/15 bg-white/[0.02] px-3 py-2 text-xs text-slate-300">
      <summary className="cursor-pointer list-none font-semibold text-violet-200 marker:hidden">
        Events on this chart ({overlay.shown.length}){" "}
        <span className="inline-block transition-transform group-open:rotate-90">▸</span>
      </summary>
      <p className="mt-2 text-slate-400">
        Events that may have affected visa trends; they are context, not a measured cause. Dashed
        lines are labelled events, dotted lines are hover only, shaded bands are date ranges.
      </p>
      <ul className="mt-2 space-y-1.5">
        {overlay.shown.map((p) => (
          <li key={p.event.id}>
            <span className="text-slate-400">{eventDateText(p.event)}</span> ·{" "}
            <b className="text-slate-100">{p.event.label}</b>: {p.event.description}
            {p.note ? <> {p.note}</> : null}{" "}
            <a href={p.event.source} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">
              Source
            </a>
          </li>
        ))}
      </ul>
      {overlay.later.length > 0 && (
        <>
          <p className="mt-3 font-semibold text-slate-200">Later than this chart (listed, not drawn)</p>
          <ul className="mt-1 space-y-1.5">
            {overlay.later.map((e) => (
              <li key={e.id}>
                <span className="text-slate-400">{eventDateText(e)}</span> ·{" "}
                <b className="text-slate-100">{e.label}</b>: {e.description}{" "}
                <a href={e.source} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">
                  Source
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}

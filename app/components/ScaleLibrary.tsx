"use client";

import { useEffect, useMemo, useState } from "react";

import { listGradeScales, type SavedGradeScale } from "../lib/api";

interface Props {
  /** Schools on the left, so a previewed scale can be sent to one of them. */
  schools: Array<{ id: string; name: string }>;
  onUse: (schoolId: string, scale: SavedGradeScale) => void;
  open: boolean;
  onToggle: () => void;
}

const ALL_COUNTRIES = "All countries";

/**
 * Orders a mapping for reading: highest grade first when the foreign grades are
 * numbers or ranges ("90-100", "85"), alphabetically when they are letters.
 */
function sortMappings(map: Record<string, string>): Array<[string, string]> {
  const entries = Object.entries(map ?? {});
  const numeric =
    entries.length > 0 && entries.every(([key]) => !Number.isNaN(Number.parseFloat(key)));
  return entries.sort(([a], [b]) =>
    numeric ? Number.parseFloat(b) - Number.parseFloat(a) : a.localeCompare(b),
  );
}

const schoolLabel = (school: { id: string; name: string }, index: number) =>
  school.name.trim() || `School ${index + 1}`;

export function ScaleLibrary({ schools, onUse, open, onToggle }: Props) {
  const [items, setItems] = useState<SavedGradeScale[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(ALL_COUNTRIES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The whole library is small, so it is fetched once and filtered here:
    // every scale's grades are then visible without another round trip.
    listGradeScales(undefined, 200)
      .then((r) => {
        if (!cancelled) {
          setItems(r.items);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const countries = useMemo(
    () =>
      [...new Set((items ?? []).map((i) => (i.country ?? "").trim()).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? [])
      .filter((item) => country === ALL_COUNTRIES || (item.country ?? "").trim() === country)
      .filter(
        (item) =>
          !q ||
          (item.name ?? "").toLowerCase().includes(q) ||
          item.instituteId.toLowerCase().includes(q) ||
          (item.country ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => (a.name || a.instituteId).localeCompare(b.name || b.instituteId));
  }, [items, country, query]);

  const selected = (items ?? []).find((i) => i.instituteId === selectedId) ?? null;
  const target = schools.find((s) => s.id === targetId) ?? schools[0];

  if (!open) {
    return (
      <aside className="shrink-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          className="sticky top-6 flex h-56 w-11 flex-col items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-[#0F2D52] shadow-sm transition hover:bg-[#0F2D52]/5"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path
              fillRule="evenodd"
              d="M12.79 5.23a.75.75 0 010 1.06L9.06 10l3.73 3.71a.75.75 0 11-1.06 1.06l-4.25-4.24a.75.75 0 010-1.06l4.25-4.24a.75.75 0 011.06 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] [writing-mode:vertical-rl]">
            Grade scales
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-full shrink-0 xl:w-[24rem]">
      <div className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-[#0F2D52]">Grade scales</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-md px-2 py-1 text-xs font-medium text-[#0F2D52] hover:bg-[#0F2D52]/10"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded
              aria-label="Hide grade scales"
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-[#0F2D52]"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 010-1.06L10.94 10 7.21 6.29a.75.75 0 111.06-1.06l4.25 4.24a.75.75 0 010 1.06l-4.25 4.24a.75.75 0 01-1.06 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </header>

        <div className="space-y-2 border-b border-slate-200 px-4 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or country…"
            aria-label="Search saved grade scales"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[#0F2D52] focus:outline-none focus:ring-2 focus:ring-[#0F2D52]/20"
          />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Filter by country"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[#0F2D52] focus:outline-none focus:ring-2 focus:ring-[#0F2D52]/20"
          >
            <option>{ALL_COUNTRIES}</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <div className="px-4 py-3 text-sm text-rose-600">{error}</div>}
          {!error && items === null && (
            <div className="px-4 py-3 text-sm text-slate-500">Loading scales…</div>
          )}
          {!error && items !== null && filtered.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500">
              No saved scales match. Build one on the left and press Save scale.
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const isSelected = item.instituteId === selectedId;
              return (
                <li key={item.instituteId}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(isSelected ? null : item.instituteId);
                      setApplied(null);
                    }}
                    aria-expanded={isSelected}
                    className={`block w-full px-4 py-2.5 text-left transition ${
                      isSelected ? "bg-[#0F2D52]/5" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-sm font-medium text-[#0F2D52]">
                      {item.name || item.instituteId}
                    </div>
                    <div className="text-xs text-slate-500" title={item.instituteId}>
                      {item.country && <span>{item.country} · </span>}
                      <span>{Object.keys(item.scale ?? {}).length} grades</span>
                      <span> · {item.foreignKind}</span>
                    </div>
                  </button>

                  {isSelected && selected && (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Foreign grade → US grade · {selected.foreignKind}
                      </div>
                      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-slate-100">
                            {sortMappings(selected.scale).map(([foreign, us]) => (
                              <tr key={foreign}>
                                <td className="px-3 py-1.5 text-slate-700">{foreign}</td>
                                <td className="px-3 py-1.5 text-right font-medium text-[#0F2D52]">
                                  {us}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        US letter → points
                      </div>
                      {selected.letterToGpa && Object.keys(selected.letterToGpa).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(selected.letterToGpa)
                            .sort((a, b) => b[1] - a[1])
                            .map(([letter, points]) => (
                              <span
                                key={letter}
                                className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700"
                              >
                                {letter} <span className="text-[#0F2D52]">{points.toFixed(1)}</span>
                              </span>
                            ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          None saved — the school keeps its own points.
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        {schools.length > 1 && (
                          <select
                            value={target?.id ?? ""}
                            onChange={(e) => setTargetId(e.target.value)}
                            aria-label="School to use this scale in"
                            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-[#0F2D52] focus:outline-none"
                          >
                            {schools.map((school, i) => (
                              <option key={school.id} value={school.id}>
                                {schoolLabel(school, i)}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          disabled={!target}
                          onClick={() => {
                            if (!target) return;
                            onUse(target.id, selected);
                            const index = schools.findIndex((s) => s.id === target.id);
                            setApplied(`Applied to ${schoolLabel(target, index)}.`);
                          }}
                          className="rounded-md bg-[#0F2D52] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1B3F6D] disabled:opacity-50"
                        >
                          Use this scale
                        </button>
                      </div>
                      {applied && (
                        <p className="mt-2 text-right text-xs font-medium text-emerald-700">
                          {applied}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        Using a scale replaces the grades and points of that school. Edit them on
                        the left.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}

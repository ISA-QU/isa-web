"use client";

import { useEffect, useRef, useState } from "react";
import { listGradeScales, type SavedGradeScale } from "../lib/api";

interface Props {
  onPick: (scale: SavedGradeScale) => void;
}

export function ScaleSearch({ onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SavedGradeScale[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open) return;
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      listGradeScales(query || undefined, 10)
        .then((r) => setResults(r.items))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const pick = (s: SavedGradeScale) => {
    onPick(s);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative">
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Use saved grading scale</span>
        <input
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[#0F2D52] focus:outline-none focus:ring-2 focus:ring-[#0F2D52]/20"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Search by institute ID or name…"
        />
      </label>

      {open && (
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>
          )}
          {error && (
            <div className="px-3 py-2 text-xs text-rose-600">{error}</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">No scales found.</div>
          )}
          {results.map((s) => (
            <button
              key={s.instituteId}
              onClick={() => pick(s)}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
            >
              <div className="font-medium text-[#0F2D52]">{s.name || s.instituteId}</div>
              <div className="text-xs text-slate-500">
                <span className="font-mono">{s.instituteId}</span>
                {s.country && <span> · {s.country}</span>}
                <span> · {Object.keys(s.scale || {}).length} mappings</span>
              </div>
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="block w-full bg-slate-50 px-3 py-1.5 text-center text-xs text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

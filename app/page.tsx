"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { asset } from "./lib/basePath";
import {
  deleteTranscript,
  getTranscript,
  listTranscripts,
  type TranscriptSummary,
} from "./lib/api";
import { calculateGpa } from "./lib/gpa";
import { downloadReport } from "./lib/exportPdf";
import { formatGpa } from "./lib/format";

export default function Home() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TranscriptSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (q: string) => {
    setLoading(true);
    setError(null);
    listTranscripts(q || undefined, 20)
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load("");
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete transcript for ${name || id}?`)) return;
    setBusy(id);
    try {
      await deleteTranscript(id);
      setItems((prev) => prev.filter((i) => i.studentId !== id));
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (id: string) => {
    setBusy(id);
    try {
      const { snapshot } = await getTranscript(id);
      if (!snapshot) throw new Error("Snapshot missing");
      const schoolStats = snapshot.schools.map((s) => ({
        school: s,
        ...calculateGpa(s.courses, s.scale, s.letterToGpa),
      }));
      let totalPoints = 0;
      let totalCredits = 0;
      for (const s of schoolStats) {
        for (const c of s.converted) {
          if (c.gpaPoints !== null && c.credits !== null) {
            totalPoints += c.gpaPoints * c.credits;
            totalCredits += c.credits;
          }
        }
      }
      await downloadReport({
        student: snapshot.student,
        schools: schoolStats.map((s) => ({
          school: s.school,
          converted: s.converted,
          gpa: s.gpa,
          totalCredits: s.totalCredits,
        })),
        cumulativeGpa: totalCredits > 0 ? totalPoints / totalCredits : null,
        cumulativeCredits: totalCredits,
      });
    } catch (e) {
      alert(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0F2D52] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Office of International Admissions
              <span className="text-[#F1B82D]">.</span>
            </h1>
            <p className="mt-1 text-sm text-slate-200">
              Tools for Quinnipiac University international admissions staff.
            </p>
          </div>
          <Image
            src={asset("/QUwhitebg.png")}
            alt="Quinnipiac University"
            width={1501}
            height={406}
            priority
            className="h-12 w-auto shrink-0 sm:h-14"
          />
        </div>
        <div className="h-1 bg-[#F1B82D]" />
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Search transcripts</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[#0F2D52] focus:outline-none focus:ring-2 focus:ring-[#0F2D52]/20"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="QU ID or name…"
                />
              </label>
            </div>
            <Link
              href="/calculator"
              className="rounded-md bg-[#0F2D52] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1B3F6D] focus:outline-none focus:ring-2 focus:ring-[#F1B82D]"
            >
              + New transcript
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#0F2D52]">
            {query ? "Results" : "Recent transcripts"}
          </h2>

          {loading && <div className="mt-4 text-sm text-slate-500">Loading…</div>}
          {error && <div className="mt-4 text-sm text-rose-600">{error}</div>}

          {!loading && !error && items.length === 0 && (
            <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              {query
                ? "No transcripts match this search."
                : "No transcripts yet. Click + New transcript to create one."}
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">QU ID</th>
                    <th className="px-4 py-3 font-semibold">College</th>
                    <th className="px-4 py-3 font-semibold w-24">GPA</th>
                    <th className="px-4 py-3 font-semibold w-20">Credits</th>
                    <th className="px-4 py-3 w-72"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((t) => (
                    <tr key={t.studentId} className="bg-white">
                      <td className="px-4 py-3 font-medium text-[#0F2D52]">
                        {t.name || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {t.studentId}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {t.college || "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0F2D52]">
                        {t.cumulativeGpa !== null && t.cumulativeGpa !== undefined
                          ? formatGpa(t.cumulativeGpa)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {(t.totalCredits ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Link
                            href={`/calculator?id=${encodeURIComponent(t.studentId)}`}
                            className="rounded-md px-2 py-1 text-xs font-medium text-[#0F2D52] hover:bg-[#0F2D52]/10"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => handleDownload(t.studentId)}
                            disabled={busy === t.studentId}
                            className="rounded-md px-2 py-1 text-xs font-medium text-[#0F2D52] hover:bg-[#0F2D52]/10 disabled:opacity-50"
                          >
                            {busy === t.studentId ? "…" : "Download"}
                          </button>
                          <button
                            onClick={() => handleDelete(t.studentId, t.name)}
                            disabled={busy === t.studentId}
                            className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-6 pb-8 text-center text-xs text-slate-400">
        Office of International Admissions · Quinnipiac University
      </footer>
    </div>
  );
}

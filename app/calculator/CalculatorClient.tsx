"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import defaultLetterScale from "../lib/defaultLetterScale.json";
import type { Course, GradingScale, School, StudentInfo } from "../lib/types";
import { calculateGpa } from "../lib/gpa";
import { downloadReport } from "../lib/exportPdf";
import { formatGpa } from "../lib/format";
import { SchoolCard } from "../components/SchoolCard";
import { asset } from "../lib/basePath";
import { getTranscript, saveTranscript } from "../lib/api";

const uid = () => Math.random().toString(36).slice(2, 10);

const makeInitialScale = (): GradingScale => ({
  name: "",
  foreignKind: "letter",
  usKind: "letter",
  rows: [
    { id: uid(), foreignGrade: "A", usGrade: "A" },
    { id: uid(), foreignGrade: "B", usGrade: "B" },
    { id: uid(), foreignGrade: "C", usGrade: "C" },
    { id: uid(), foreignGrade: "D", usGrade: "D" },
    { id: uid(), foreignGrade: "F", usGrade: "F" },
  ],
});

const makeInitialCourses = (): Course[] => [
  { id: uid(), semester: "1", name: "", credits: "", grade: "" },
];

const makeInitialSchool = (): School => ({
  id: uid(),
  name: "",
  country: "",
  instituteId: "",
  scale: makeInitialScale(),
  letterToGpa: { ...defaultLetterScale },
  courses: makeInitialCourses(),
});

const initialStudent: StudentInfo = {
  name: "",
  quId: "",
  calculatedBy: "",
};

export default function CalculatorClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentIdParam = searchParams.get("id") || "";
  const [student, setStudent] = useState<StudentInfo>(initialStudent);
  const [schools, setSchools] = useState<School[]>(() => [makeInitialSchool()]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);

  useEffect(() => {
    if (!studentIdParam) return;
    let cancelled = false;
    setHydrating(true);
    getTranscript(studentIdParam)
      .then((res) => {
        if (cancelled || !res.snapshot) return;
        setStudent(res.snapshot.student);
        setSchools(res.snapshot.schools);
      })
      .catch((e) => {
        if (!cancelled) setSaveMsg(`Load failed: ${e.message}`);
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentIdParam]);

  const schoolStats = useMemo(
    () =>
      schools.map((s) => ({
        school: s,
        ...calculateGpa(s.courses, s.scale, s.letterToGpa),
      })),
    [schools],
  );

  const cumulative = useMemo(() => {
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
    return {
      gpa: totalCredits > 0 ? totalPoints / totalCredits : null,
      totalCredits,
    };
  }, [schoolStats]);

  const handleClear = () => {
    if (!confirm("Clear all data on this page? This cannot be undone.")) return;
    setStudent(initialStudent);
    setSchools([makeInitialSchool()]);
    setSaveMsg(null);
    if (studentIdParam) router.replace("/calculator");
  };

  const updateSchool = (id: string, next: School) => {
    setSchools((prev) => prev.map((s) => (s.id === id ? next : s)));
  };

  const addSchool = () => {
    setSchools((prev) => [...prev, makeInitialSchool()]);
  };

  const removeSchool = (id: string) => {
    setSchools((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDownload = async () => {
    await downloadReport({
      student,
      schools: schoolStats.map((s) => ({
        school: s.school,
        converted: s.converted,
        gpa: s.gpa,
        totalCredits: s.totalCredits,
      })),
      cumulativeGpa: cumulative.gpa,
      cumulativeCredits: cumulative.totalCredits,
    });
  };

  const handleSaveTranscript = async () => {
    const studentId = student.quId.trim();
    if (!studentId) {
      setSaveMsg("QU ID is required to save.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    const firstSchool = schools[0];
    try {
      await saveTranscript({
        studentId,
        name: student.name,
        cumulativeGpa: cumulative.gpa,
        totalCredits: cumulative.totalCredits,
        college: firstSchool?.name || "",
        instituteId: firstSchool?.instituteId || "",
        schools: schoolStats.map((s) => ({
          schoolId: s.school.id,
          schoolName: s.school.name,
          country: s.school.country,
          instituteId: s.school.instituteId,
          gpa: s.gpa,
          credits: s.totalCredits,
        })),
        snapshot: { student, schools, savedAt: Date.now() },
      });
      setSaveMsg("Saved.");
      if (studentIdParam !== studentId) {
        router.replace(`/calculator?id=${encodeURIComponent(studentId)}`);
      }
    } catch (e) {
      setSaveMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[#0F2D52] focus:outline-none focus:ring-2 focus:ring-[#0F2D52]/20";

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
              Foreign-to-US GPA calculator for Quinnipiac University.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/"
                aria-label="Back to home"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/20"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.79 5.23a.75.75 0 010 1.06L9.06 10l3.73 3.71a.75.75 0 11-1.06 1.06l-4.25-4.24a.75.75 0 010-1.06l4.25-4.24a.75.75 0 011.06 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Home
              </Link>
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear all data"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/20"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                    clipRule="evenodd"
                  />
                </svg>
                Clear
              </button>
            </div>
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
          <h2 className="text-lg font-semibold text-[#0F2D52]">Student information</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Name</span>
              <input
                className={inputCls}
                value={student.name}
                onChange={(e) => setStudent({ ...student, name: e.target.value })}
                placeholder="Bruce Wayne"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">QU ID</span>
              <input
                className={inputCls}
                value={student.quId}
                onChange={(e) => setStudent({ ...student, quId: e.target.value })}
                placeholder="2680540"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Calculated by (username)</span>
              <input
                className={inputCls}
                value={student.calculatedBy}
                onChange={(e) => setStudent({ ...student, calculatedBy: e.target.value })}
                placeholder="Matan Odell"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#0F2D52]">Foreign schools</h2>
              <p className="text-sm text-slate-500">
                Add a school for each transcript. Each has its own grading scale and courses.
              </p>
            </div>
            <button
              onClick={addSchool}
              className="rounded-md border border-[#0F2D52] bg-white px-3 py-1.5 text-sm font-medium text-[#0F2D52] transition hover:bg-[#0F2D52] hover:text-white"
            >
              + Add school
            </button>
          </div>

          {schoolStats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No schools yet. Click <span className="font-medium">+ Add school</span> to begin.
            </div>
          ) : (
            schoolStats.map((s, i) => (
              <SchoolCard
                key={s.school.id}
                school={s.school}
                index={i}
                converted={s.converted}
                gpa={s.gpa}
                totalCredits={s.totalCredits}
                defaultExpanded={i === 0}
                onChange={(next) => updateSchool(s.school.id, next)}
                onRemove={() => removeSchool(s.school.id)}
              />
            ))
          )}
        </section>

        <section className="rounded-xl border border-[#0F2D52] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-500">Cumulative GPA</div>
              <div className="mt-1 inline-flex items-baseline rounded-md bg-[#0F2D52] px-4 py-2">
                <span className="text-4xl font-bold text-[#F1B82D]">
                  {cumulative.gpa !== null ? formatGpa(cumulative.gpa) : "—"}
                </span>
                <span className="ml-2 text-base text-slate-200">/4</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Across {cumulative.totalCredits.toFixed(2)} credits · {schools.length} school
                {schools.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSaveTranscript}
                  disabled={saving || hydrating}
                  className="rounded-md border border-[#0F2D52] bg-white px-4 py-2 text-sm font-semibold text-[#0F2D52] transition hover:bg-[#0F2D52] hover:text-white disabled:opacity-50"
                >
                  {(() => {
                    const isUpdate =
                      !!studentIdParam &&
                      student.quId.trim() === studentIdParam;
                    if (saving) return isUpdate ? "Updating…" : "Saving…";
                    return isUpdate ? "Update transcript" : "Save transcript";
                  })()}
                </button>
                <button
                  onClick={handleDownload}
                  className="rounded-md bg-[#0F2D52] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1B3F6D] focus:outline-none focus:ring-2 focus:ring-[#F1B82D]"
                >
                  Download PDF report
                </button>
              </div>
              {saveMsg && (
                <div className="text-xs text-slate-600">{saveMsg}</div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-6 pb-8 text-center text-xs text-slate-400">
        Office of International Admissions · Quinnipiac University
      </footer>
    </div>
  );
}

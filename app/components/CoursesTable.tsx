"use client";

import { useState } from "react";
import type { Course, GradingScale } from "../lib/types";
import type { ConvertedCourse } from "../lib/gpa";
import { sanitizeByKind, sanitizeNumeric } from "../lib/input";

interface Props {
  courses: Course[];
  converted: ConvertedCourse[];
  scale: GradingScale;
  onChange: (courses: Course[]) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const blankCourse = (): Course => ({
  id: uid(),
  semester: "",
  name: "",
  credits: "",
  grade: "",
});

export function CoursesTable({ courses, converted, scale, onChange }: Props) {
  const [bulkCount, setBulkCount] = useState("5");

  const update = (id: string, patch: Partial<Course>) => {
    if (patch.semester !== undefined) patch.semester = sanitizeNumeric(patch.semester);
    if (patch.credits !== undefined) patch.credits = sanitizeNumeric(patch.credits);
    if (patch.grade !== undefined) patch.grade = sanitizeByKind(patch.grade, scale.foreignKind);
    onChange(courses.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addRow = () => onChange([...courses, blankCourse()]);
  const addManyRows = () => {
    const n = Math.max(1, Math.min(50, parseInt(bulkCount, 10) || 1));
    const extras = Array.from({ length: n }, blankCourse);
    onChange([...courses, ...extras]);
  };

  const removeRow = (id: string) => onChange(courses.filter((c) => c.id !== id));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= courses.length) return;
    const next = [...courses];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const convertedById = new Map(converted.map((c) => [c.course.id, c]));

  const gradePlaceholder =
    scale.foreignKind === "letter"
      ? "A"
      : scale.foreignKind === "numeric" || scale.foreignKind === "range"
        ? "85"
        : scale.foreignKind === "alphanumeric"
          ? "A1"
          : "Pass";

  const cellInput =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[#0F2D52] focus:outline-none focus:ring-2 focus:ring-[#0F2D52]/20";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#0F2D52]">Courses</h2>
      <p className="mt-1 text-sm text-slate-500">
        Semester/year and credits accept numbers only. Grade accepts the {scale.foreignKind} format
        set above. Use the arrows to reorder.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3 font-semibold w-12"></th>
              <th className="px-3 py-3 font-semibold w-24">Sem/Year</th>
              <th className="px-3 py-3 font-semibold">Course</th>
              <th className="px-3 py-3 font-semibold w-24">Credits</th>
              <th className="px-3 py-3 font-semibold w-28">Grade</th>
              <th className="px-3 py-3 font-semibold w-24">US</th>
              <th className="px-3 py-3 font-semibold w-24">Pts</th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {courses.map((c, i) => {
              const cc = convertedById.get(c.id);
              return (
                <tr key={c.id} className="bg-white align-middle">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label="Move row up"
                        className="text-xs text-[#0F2D52] disabled:text-slate-300 hover:text-[#1B3F6D]"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === courses.length - 1}
                        aria-label="Move row down"
                        className="text-xs text-[#0F2D52] disabled:text-slate-300 hover:text-[#1B3F6D]"
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="numeric"
                      className={cellInput}
                      value={c.semester}
                      onChange={(e) => update(c.id, { semester: e.target.value })}
                      placeholder="1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={cellInput}
                      value={c.name}
                      onChange={(e) => update(c.id, { name: e.target.value })}
                      placeholder="Course name"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="decimal"
                      className={cellInput}
                      value={c.credits}
                      onChange={(e) => update(c.id, { credits: e.target.value })}
                      placeholder="3"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={cellInput}
                      value={c.grade}
                      onChange={(e) => update(c.id, { grade: e.target.value })}
                      placeholder={gradePlaceholder}
                    />
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-slate-700">
                    {cc?.usGrade ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700">
                    {cc?.gpaPoints !== undefined && cc?.gpaPoints !== null
                      ? cc.gpaPoints.toFixed(2)
                      : "—"}
                    {cc?.error && (
                      <div className="text-xs text-rose-600">{cc.error}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeRow(c.id)}
                      className="rounded-md p-1 text-sm text-rose-600 hover:bg-rose-50"
                      aria-label="Remove course"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5">
          <input
            inputMode="numeric"
            value={bulkCount}
            onChange={(e) => setBulkCount(e.target.value.replace(/[^\d]/g, ""))}
            className="w-12 rounded-md border-0 bg-transparent px-2 py-1 text-center text-sm focus:outline-none"
            aria-label="Number of rows to add"
          />
          <button
            onClick={addManyRows}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[#0F2D52] hover:bg-[#0F2D52]/10"
          >
            + Add rows
          </button>
        </div>
        <button
          onClick={addRow}
          className="rounded-md border border-[#0F2D52] bg-[#0F2D52] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#1B3F6D]"
        >
          + Add course
        </button>
      </div>
    </section>
  );
}

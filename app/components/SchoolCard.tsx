"use client";

import { useState } from "react";
import type { School } from "../lib/types";
import type { ConvertedCourse } from "../lib/gpa";
import { formatGpa } from "../lib/format";
import { ScaleEditor } from "./ScaleEditor";
import { CoursesTable } from "./CoursesTable";

interface Props {
  school: School;
  index: number;
  converted: ConvertedCourse[];
  gpa: number | null;
  totalCredits: number;
  defaultExpanded?: boolean;
  /** Takes an updater, not a value: two updates in one tick must not overwrite each other. */
  onChange: (update: (school: School) => School) => void;
  onRemove: () => void;
}

export function SchoolCard({
  school,
  index,
  converted,
  gpa,
  totalCredits,
  defaultExpanded = true,
  onChange,
  onRemove,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const inputCls =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[#0F2D52] focus:outline-none focus:ring-2 focus:ring-[#0F2D52]/20";

  const displayTitle = school.name.trim() || `School ${index + 1}`;
  const displayCountry = school.country.trim();
  const courseCount = `${school.courses.length} course${school.courses.length === 1 ? "" : "s"}`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse school" : "Expand school"}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-md border border-[#0F2D52]/30 text-[#0F2D52] transition ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-[#0F2D52]">
              {displayTitle}
              {displayCountry && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  · {displayCountry}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {gpa !== null
                ? `School GPA ${formatGpa(gpa)} · ${totalCredits.toFixed(2)} credits · ${courseCount}`
                : courseCount}
            </div>
          </div>
        </button>
        <button
          onClick={onRemove}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
          aria-label="Remove school"
        >
          Remove
        </button>
      </header>

      {expanded && (
        <div className="space-y-6 border-t border-slate-200 px-6 py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Foreign school name</span>
              <input
                className={inputCls}
                value={school.name}
                onChange={(e) => {
                  const name = e.target.value;
                  onChange((s) => ({ ...s, name }));
                }}
                placeholder="e.g. Quinnipiac University"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Country</span>
              <input
                className={inputCls}
                value={school.country}
                onChange={(e) => {
                  const country = e.target.value;
                  onChange((s) => ({ ...s, country }));
                }}
                placeholder="USA"
              />
            </label>
          </div>

          <ScaleEditor
            scale={school.scale}
            letterToGpa={school.letterToGpa}
            schoolName={school.name}
            schoolCountry={school.country}
            instituteId={school.instituteId}
            onChange={(scale) => onChange((s) => ({ ...s, scale }))}
            onLetterToGpaChange={(letterToGpa) => onChange((s) => ({ ...s, letterToGpa }))}
            onInstituteIdChange={(instituteId) => onChange((s) => ({ ...s, instituteId }))}
          />

          <CoursesTable
            courses={school.courses}
            converted={converted}
            scale={school.scale}
            onChange={(courses) => onChange((s) => ({ ...s, courses }))}
          />
        </div>
      )}
    </section>
  );
}

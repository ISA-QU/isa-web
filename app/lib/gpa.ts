import type { Course, GradingScale, ScaleRow } from "./types";

export interface ConvertedCourse {
  course: Course;
  matchedRow: ScaleRow | null;
  usGrade: string | null;
  gpaPoints: number | null;
  credits: number | null;
  error?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

function parseRange(s: string): [number, number] | null {
  const m = s.replace(/\s/g, "").match(/^(-?\d+(?:\.\d+)?)[-–to]+(-?\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a <= b ? [a, b] : [b, a];
}

export function matchScaleRow(scale: GradingScale, foreignGrade: string): ScaleRow | null {
  const g = foreignGrade.trim();
  if (!g) return null;

  if (scale.foreignKind === "letter" || scale.foreignKind === "alphanumeric" || scale.foreignKind === "text") {
    return scale.rows.find((r) => norm(r.foreignGrade) === norm(g)) ?? null;
  }

  if (scale.foreignKind === "numeric") {
    const num = parseFloat(g);
    if (Number.isNaN(num)) return null;
    return scale.rows.find((r) => parseFloat(r.foreignGrade) === num) ?? null;
  }

  // range
  const num = parseFloat(g);
  if (Number.isNaN(num)) return null;
  return (
    scale.rows.find((r) => {
      const range = parseRange(r.foreignGrade);
      if (!range) return false;
      return num >= range[0] && num <= range[1];
    }) ?? null
  );
}

export function convertCourse(
  course: Course,
  scale: GradingScale,
  letterToGpa: Record<string, number>,
): ConvertedCourse {
  const credits = parseFloat(course.credits);
  const creditsValid = !Number.isNaN(credits) && credits > 0;

  if (!course.grade.trim()) {
    return {
      course,
      matchedRow: null,
      usGrade: null,
      gpaPoints: null,
      credits: creditsValid ? credits : null,
      error: "Missing grade",
    };
  }

  const row = matchScaleRow(scale, course.grade);
  if (!row) {
    return {
      course,
      matchedRow: null,
      usGrade: null,
      gpaPoints: null,
      credits: creditsValid ? credits : null,
      error: "Grade not found in scale",
    };
  }

  const key = Object.keys(letterToGpa).find(
    (k) => norm(k) === norm(row.usGrade),
  );
  const gpaPoints = key !== undefined ? letterToGpa[key] : null;

  return {
    course,
    matchedRow: row,
    usGrade: row.usGrade,
    gpaPoints,
    credits: creditsValid ? credits : null,
    error: gpaPoints === null ? "US grade has no GPA mapping" : !creditsValid ? "Invalid credits" : undefined,
  };
}

export function calculateGpa(
  courses: Course[],
  scale: GradingScale,
  letterToGpa: Record<string, number>,
) {
  const converted = courses.map((c) => convertCourse(c, scale, letterToGpa));
  let totalPoints = 0;
  let totalCredits = 0;
  for (const c of converted) {
    if (c.gpaPoints !== null && c.credits !== null) {
      totalPoints += c.gpaPoints * c.credits;
      totalCredits += c.credits;
    }
  }
  const gpa = totalCredits > 0 ? totalPoints / totalCredits : null;
  return { converted, totalCredits, totalPoints, gpa };
}

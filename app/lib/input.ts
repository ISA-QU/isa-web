import type { ForeignGradeKind, USScaleKind } from "./types";

export type GradeKind = ForeignGradeKind | USScaleKind;

export function sanitizeByKind(value: string, kind: GradeKind): string {
  if (kind === "letter") {
    return value.replace(/[^A-Za-z+\-]/g, "").toUpperCase();
  }
  if (kind === "alphanumeric") {
    return value.replace(/[^A-Za-z0-9+\-]/g, "").toUpperCase();
  }
  if (kind === "text") {
    return value;
  }
  if (kind === "numeric") {
    let v = value.replace(/[^\d.]/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    }
    return v;
  }
  // range: digits, one dot per segment, one dash
  let v = value.replace(/[^\d.\-]/g, "");
  const firstDash = v.indexOf("-");
  if (firstDash !== -1) {
    v = v.slice(0, firstDash + 1) + v.slice(firstDash + 1).replace(/-/g, "");
  }
  return v;
}

export function sanitizeNumeric(value: string): string {
  return sanitizeByKind(value, "numeric");
}

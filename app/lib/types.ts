export type USScaleKind = "letter";
export type ForeignGradeKind = "letter" | "numeric" | "range" | "alphanumeric" | "text";

export interface ScaleRow {
  id: string;
  foreignGrade: string;
  usGrade: string;
}

export interface GradingScale {
  name: string;
  foreignKind: ForeignGradeKind;
  usKind: USScaleKind;
  rows: ScaleRow[];
}

export interface Course {
  id: string;
  semester: string;
  name: string;
  credits: string;
  grade: string;
}

export interface School {
  id: string;
  name: string;
  country: string;
  instituteId: string;
  scale: GradingScale;
  letterToGpa: Record<string, number>;
  courses: Course[];
}

export interface StudentInfo {
  name: string;
  quId: string;
  calculatedBy: string;
}

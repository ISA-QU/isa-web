import { API_BASE_URL } from "./awsConfig";
import type { School, StudentInfo } from "./types";

export interface TranscriptSummary {
  studentId: string;
  name: string;
  cumulativeGpa: number | null;
  totalCredits: number;
  college: string;
  instituteId: string;
  schools: Array<{
    schoolId: string;
    schoolName: string;
    country: string;
    instituteId: string;
    gpa: number | null;
    credits: number;
  }>;
  updatedAt: number;
}

export interface TranscriptSnapshot {
  student: StudentInfo;
  schools: School[];
  savedAt: number;
}

export interface SavedGradeScale {
  instituteId: string;
  name: string;
  country: string;
  foreignKind: "letter" | "numeric" | "range" | "alphanumeric" | "text";
  scale: Record<string, string>;
  letterToGpa?: Record<string, number>;
  updatedAt: number;
}

function ensureBase(): string {
  if (!API_BASE_URL) {
    throw new Error(
      "API base URL is not configured. Set NEXT_PUBLIC_API_BASE_URL in .env.local.",
    );
  }
  return API_BASE_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ensureBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const listTranscripts = (q?: string, limit = 20) => {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("limit", String(limit));
  return request<{ items: TranscriptSummary[] }>(`/transcripts?${params}`);
};

export const getTranscript = (studentId: string) =>
  request<{ meta: TranscriptSummary; snapshot: TranscriptSnapshot | null }>(
    `/transcripts/${encodeURIComponent(studentId)}`,
  );

export const saveTranscript = (payload: {
  studentId: string;
  name: string;
  cumulativeGpa: number | null;
  totalCredits: number;
  college: string;
  instituteId: string;
  schools: TranscriptSummary["schools"];
  snapshot: TranscriptSnapshot;
}) =>
  request<{ ok: true; studentId: string; updatedAt: number }>(`/transcripts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteTranscript = (studentId: string) =>
  request<{ ok: true }>(`/transcripts/${encodeURIComponent(studentId)}`, {
    method: "DELETE",
  });

export const listGradeScales = (q?: string, limit = 50) => {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("limit", String(limit));
  return request<{ items: SavedGradeScale[] }>(`/gradescales?${params}`);
};

export const getGradeScale = (instituteId: string) =>
  request<{ item: SavedGradeScale }>(
    `/gradescales/${encodeURIComponent(instituteId)}`,
  );

export const saveGradeScale = (scale: Omit<SavedGradeScale, "updatedAt">) =>
  request<{ ok: true; item: SavedGradeScale }>(`/gradescales`, {
    method: "POST",
    body: JSON.stringify(scale),
  });

export const deleteGradeScale = (instituteId: string) =>
  request<{ ok: true }>(`/gradescales/${encodeURIComponent(instituteId)}`, {
    method: "DELETE",
  });

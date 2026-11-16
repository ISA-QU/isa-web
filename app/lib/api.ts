import { authHeaders, redirectToLogin } from "./auth";
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

/** An HTTP error from the API, carrying the status so callers can act on 404. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ensureBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Your session has expired. Sign in again.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(`${res.status} ${res.statusText}: ${text}`, res.status);
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

/**
 * The stored transcript for a QU ID, or null when that ID is free.
 *
 * Used to warn before a save overwrites someone else's record. It is advisory
 * only: nothing stops a simultaneous save under the same ID, which would need a
 * conditional write in the upload-transcript Lambda.
 */
export const findTranscript = async (studentId: string) => {
  try {
    return await getTranscript(studentId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

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

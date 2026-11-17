/**
 * The Update data tab's "upload connection": where the monthly PDFs go to be checked and
 * applied. The tab only sends files and shows reports; all the checking is done by the intake
 * engine (scripts/intake), never in the browser.
 *
 * The mode is fixed at build time by NEXT_PUBLIC_UPLOAD_MODE:
 * - "off" (the default, and always on the live site): the tab says it isn't connected yet.
 * - "local": the intake server on this computer, started by `npm run dev:admin`, which also
 *   sets NEXT_PUBLIC_INTAKE_URL and a one-time NEXT_PUBLIC_INTAKE_TOKEN in memory only.
 * - "aws" (written, switched off until AWS is set up; see docs/UPLOAD_AWS_SETUP.md): the
 *   intake-upload Lambda at NEXT_PUBLIC_UPLOAD_API_URL, set only when the site is built for
 *   deploy, with the dashboard's own sign-in. Only members of the admin group can use it.
 * `npm run deploy` runs `npm run check:upload-off`, which stops the deploy if the built site is
 * connected to this computer, or to AWS without the deploy saying so.
 */

import { AuthError, authHeaders } from "../../auth";

export type UploadMode = "off" | "local" | "aws";

export interface CheckResult {
  ok: boolean;
  error?: string;
  /** The intake report, as text. */
  report?: string;
  /** Yellow warnings: a month far above or below the same month a year earlier. */
  bigChanges?: string[];
  /** What Apply needs to apply exactly these checked files. */
  id?: string;
}

export interface ApplyResult {
  ok: boolean;
  /** "Applied: …", or "Apply failed, old files restored, nothing changed." */
  message: string;
  /** The steps and their output. */
  text?: string;
}

export interface UndoInfo {
  ok: boolean;
  error?: string;
  /** The backup that undo would restore (sent back to confirm). */
  backup?: string;
  text?: string;
}

export interface UploadConnection {
  mode: UploadMode;
  /** In aws mode, the sign-in group whose members can use it. */
  adminGroup?: string;
  check(files: File[], replace: boolean): Promise<CheckResult>;
  apply(id: string): Promise<ApplyResult>;
  undoInfo(): Promise<UndoInfo>;
  undo(backup: string): Promise<ApplyResult>;
}

export const NOT_CONNECTED = "Not connected yet: updates are done on the office laptop until AWS is restored.";

const notConnected = async (): Promise<never> => {
  throw new Error(NOT_CONNECTED);
};

const OFF: UploadConnection = {
  mode: "off",
  check: notConnected,
  apply: notConnected,
  undoInfo: notConnected,
  undo: notConnected,
};

/** The intake server on this computer (scripts/intake/admin_server.py), as `npm run dev:admin` starts it. */
function localConnection(base: string, token: string): UploadConnection {
  const post = async (path: string, body: BodyInit, json: boolean) => {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "X-Intake-Token": token, ...(json ? { "Content-Type": "application/json" } : {}) },
        body,
      });
    } catch {
      throw new Error("Can't reach the intake server on this computer. Is `npm run dev:admin` still running?");
    }
    if (response.status === 403) throw new Error("The intake server refused the request. Restart `npm run dev:admin`.");
    return response.json();
  };
  return {
    mode: "local",
    async check(files, replace) {
      const form = new FormData();
      for (const file of files) form.append("pdf", file, file.name);
      form.append("replace", replace ? "1" : "0");
      const r = await post("/api/preview", form, false);
      return r.ok
        ? { ok: true, report: r.report, bigChanges: r.bigChanges ?? [], id: r.staging }
        : { ok: false, error: r.error };
    },
    async apply(id) {
      const r = await post("/api/apply", JSON.stringify({ staging: id }), true);
      return r.error ? { ok: false, message: `Stopped: ${r.error}` } : { ok: r.ok, message: r.message, text: r.text };
    },
    async undoInfo() {
      const r = await post("/api/undo-info", "{}", true);
      return r.ok ? { ok: true, backup: r.backup, text: r.text } : { ok: false, error: r.error };
    },
    async undo(backup) {
      const r = await post("/api/undo", JSON.stringify({ backup }), true);
      return r.error ? { ok: false, message: `Stopped: ${r.error}` } : { ok: r.ok, message: r.message, text: r.text };
    },
  };
}

/** How often the tab asks whether an AWS job is done, and when it stops waiting. */
const POLL_MS = 3000;
const GIVE_UP_MS = 8 * 60 * 1000;

/**
 * The intake-upload Lambda (backend/lambdas/intake-upload). The API stops waiting after about
 * 29 seconds and a check takes about a minute, so each action starts a job and the tab polls it.
 * The PDFs go straight to storage through one-time upload links.
 */
function awsConnection(base: string, adminGroup: string): UploadConnection {
  const api = base.replace(/\/+$/, "");
  const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
    let response: Response;
    try {
      response = await fetch(`${api}${path}`, {
        method,
        headers: { ...(await authHeaders()), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (e instanceof AuthError) throw e;
      throw new Error("Can't reach the upload service. Check the internet connection and try again.");
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error("Your sign-in has expired. Sign in again, then try again.");
    if (!response.ok) throw new Error(data.error ?? `The upload service answered ${response.status}.`);
    return data;
  };
  const job = async (body: Record<string, unknown>) => {
    const { jobId } = await call("POST", "/intake/jobs", body);
    const started = Date.now();
    while (Date.now() - started < GIVE_UP_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const status = await call("GET", `/intake/jobs/${encodeURIComponent(jobId)}`);
      if (status.status === "done" || status.status === "failed") return status.result ?? {};
    }
    throw new Error(
      "No answer after 8 minutes. Wait a few minutes before trying again, and ask the IT/AWS contact to check the upload function's log.",
    );
  };
  return {
    mode: "aws",
    adminGroup,
    async check(files, replace) {
      const links = await call("POST", "/intake/uploads", { files: files.map((f) => ({ name: f.name, size: f.size })) });
      for (const [i, link] of (links.uploads as { name: string; url: string; fields: Record<string, string> }[]).entries()) {
        const form = new FormData();
        for (const [key, value] of Object.entries(link.fields)) form.append(key, value);
        form.append("file", files[i], link.name);
        let uploaded: Response;
        try {
          uploaded = await fetch(link.url, { method: "POST", body: form });
        } catch {
          throw new Error(`Uploading ${link.name} failed. Check the internet connection and try again.`);
        }
        if (!uploaded.ok) throw new Error(`Uploading ${link.name} failed (${uploaded.status}). Try again.`);
      }
      const r = await job({ action: "check", uploadId: links.uploadId, replace });
      return r.ok ? { ok: true, report: r.report, bigChanges: r.bigChanges ?? [], id: r.id } : { ok: false, error: r.error };
    },
    async apply(id) {
      const r = await job({ action: "apply", checkJob: id });
      return { ok: Boolean(r.ok), message: r.message ?? "Stopped: no answer from the upload service.", text: r.text };
    },
    async undoInfo() {
      const r = await job({ action: "undo-info" });
      return r.ok ? { ok: true, backup: r.backup, text: r.text } : { ok: false, error: r.error };
    },
    async undo(backup) {
      const r = await job({ action: "undo", backup });
      return { ok: Boolean(r.ok), message: r.message ?? "Stopped: no answer from the upload service.", text: r.text };
    },
  };
}

/**
 * Whether the signed-in person (the stored session, as `sessionSnapshot()` returns it) is in the
 * admin group. Only decides whether the tab offers the buttons; the Lambda checks it itself.
 */
export function isUploadAdmin(session: string | null, group: string | undefined): boolean {
  if (!session || !group) return false;
  try {
    const payload = (JSON.parse(session) as { idToken?: string }).idToken?.split(".")[1] ?? "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const groups = (JSON.parse(json) as Record<string, unknown>)["cognito:groups"];
    return Array.isArray(groups) && groups.includes(group);
  } catch {
    return false;
  }
}

export const NOT_ADMIN = "Only dashboard admins can update the data. Ask the IT/AWS contact to add you.";

const MODE = process.env.NEXT_PUBLIC_UPLOAD_MODE;
const LOCAL_URL = process.env.NEXT_PUBLIC_INTAKE_URL;
const LOCAL_TOKEN = process.env.NEXT_PUBLIC_INTAKE_TOKEN;
const AWS_URL = process.env.NEXT_PUBLIC_UPLOAD_API_URL;
const ADMIN_GROUP = process.env.NEXT_PUBLIC_UPLOAD_ADMIN_GROUP || "dashboard-admins";

/** The connection this build uses: "local" only when dev:admin set it up, "aws" only when a deploy set it up, otherwise "off". */
export const uploadConnection: UploadConnection =
  MODE === "local" && LOCAL_URL && LOCAL_TOKEN
    ? localConnection(LOCAL_URL, LOCAL_TOKEN)
    : MODE === "aws" && AWS_URL
      ? awsConnection(AWS_URL, ADMIN_GROUP)
      : OFF;

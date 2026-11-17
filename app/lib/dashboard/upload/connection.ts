/**
 * The Update data tab's "upload connection": where the monthly PDFs go to be checked and
 * applied. The tab only sends files and shows reports; all the checking is done by the intake
 * engine (scripts/intake), never in the browser.
 *
 * The mode is fixed at build time by NEXT_PUBLIC_UPLOAD_MODE:
 * - "off" (the default, and always on the live site): the tab says it isn't connected yet.
 * - "local": the intake server on this computer, started by `npm run dev:admin`, which also
 *   sets NEXT_PUBLIC_INTAKE_URL and a one-time NEXT_PUBLIC_INTAKE_TOKEN in memory only.
 * `npm run deploy` runs `npm run check:upload-off`, which stops the deploy if the built site
 * isn't "off".
 */

export type UploadMode = "off" | "local";

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

const LOCAL_URL = process.env.NEXT_PUBLIC_INTAKE_URL;
const LOCAL_TOKEN = process.env.NEXT_PUBLIC_INTAKE_TOKEN;

/** The connection this build uses: "local" only when dev:admin set it up, otherwise "off". */
export const uploadConnection: UploadConnection =
  process.env.NEXT_PUBLIC_UPLOAD_MODE === "local" && LOCAL_URL && LOCAL_TOKEN ? localConnection(LOCAL_URL, LOCAL_TOKEN) : OFF;

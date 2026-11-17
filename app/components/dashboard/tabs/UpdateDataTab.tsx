"use client";

import { useRef, useState, type DragEvent } from "react";

import { NOT_CONNECTED, uploadConnection, type ApplyResult, type CheckResult } from "../../../lib/dashboard/upload/connection";
import { InfoCallout, SubHeading } from "../shared";
import { Panel, SectionTitle } from "../ui";

type Busy = null | "check" | "apply" | "undo-info" | "undo";

const WORKING: Record<Exclude<Busy, null>, string> = {
  check: "Working… reading and checking the PDFs. This takes about a minute.",
  apply: "Working… replacing the files and running the checks. This takes about a minute.",
  "undo-info": "Checking which update Undo would reverse…",
  undo: "Working… undoing the update and running the checks. This takes about a minute.",
};

/**
 * Update data: adds a new month from the State Department's two monthly PDFs, through the
 * intake engine (see lib/dashboard/upload/connection.ts). Everyone sees the tab; it only acts
 * when this build is connected (local mode via `npm run dev:admin`). On the live site it says
 * it isn't connected yet.
 */
export default function UpdateDataTab() {
  const connected = uploadConnection.mode !== "off";
  const [files, setFiles] = useState<File[]>([]);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [checked, setChecked] = useState<CheckResult | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Undo's own errors, shown in the Undo section rather than under the PDFs.
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoInfo, setUndoInfo] = useState<{ backup: string; text: string } | null>(null);
  const [undone, setUndone] = useState<ApplyResult | null>(null);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const disabled = !connected || busy !== null;

  const choose = (list: FileList | null) => {
    const pdfs = [...(list ?? [])].filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    setFiles(pdfs);
    setChecked(null);
    setApplied(null);
    setError(pdfs.length === 0 && list && list.length > 0 ? "Only the two PDF reports can be added here." : null);
  };

  /** Runs one step with the buttons disabled, so nothing is pressed twice. Errors go to `showError`. */
  const run = async <T,>(
    step: Exclude<Busy, null>,
    action: () => Promise<T>,
    showError: (message: string | null) => void = setError,
  ): Promise<T | null> => {
    setBusy(step);
    showError(null);
    try {
      return await action();
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setApplied(null);
    const r = await run("check", () => uploadConnection.check(files, replace));
    if (!r) return;
    if (r.ok) setChecked(r);
    else {
      setChecked(null);
      setError(r.error ?? "The PDFs couldn't be checked.");
    }
  };

  const apply = async () => {
    if (!checked?.id) return;
    const r = await run("apply", () => uploadConnection.apply(checked.id!));
    setChecked(null);
    if (r) setApplied(r);
  };

  const askUndo = async () => {
    setUndone(null);
    const r = await run("undo-info", () => uploadConnection.undoInfo(), setUndoError);
    if (!r) return;
    if (r.ok && r.backup) setUndoInfo({ backup: r.backup, text: r.text ?? "" });
    else setUndoError(r.error ?? "There's no update to undo.");
  };

  const confirmUndo = async () => {
    if (!undoInfo) return;
    const backup = undoInfo.backup;
    setUndoInfo(null);
    const r = await run("undo", () => uploadConnection.undo(backup), setUndoError);
    if (r) setUndone(r);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setOver(false);
    if (!disabled) choose(event.dataTransfer.files);
  };

  const button =
    "rounded-md px-4 py-2 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB81C] disabled:cursor-not-allowed disabled:opacity-40";
  const gold = `${button} bg-[#FFB81C] text-[#0C2340] hover:brightness-110`;
  const ghost = `${button} border border-slate-400/30 text-slate-100 hover:bg-white/5`;
  const working = (step: Exclude<Busy, null>) => (
    <p className="flex items-center gap-2 text-sm font-semibold text-[#FFE3A3]">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#FFB81C] border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
      {WORKING[step]}
    </p>
  );
  const errorBox = (message: string) => (
    <p className="rounded-md border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100">Stopped: {message}</p>
  );
  const result = (r: ApplyResult) => {
    // The steps text starts with the same line as the heading; show it once.
    const [first, ...rest] = (r.text ?? "").split("\n");
    const details = (first.trim() === r.message.trim() ? rest.join("\n") : r.text ?? "").trim();
    return (
      <div className={`rounded-md border p-3 text-sm ${r.ok ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-rose-400/40 bg-rose-500/10 text-rose-100"}`}>
        <p className="font-bold">{r.message}</p>
        {details && <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-200">{details}</pre>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <SectionTitle>Update data</SectionTitle>
      <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
        Adds a new month from the State Department&apos;s two monthly PDFs (Nonimmigrant Visa Issuances by Nationality
        and by Post): drop both, check the report, then Apply. Nothing changes until you press Apply, the current files
        are backed up first, and Undo last update reverses it.
      </p>

      {!connected && <InfoCallout>{NOT_CONNECTED}</InfoCallout>}

      <Panel>
        <SubHeading>1. Add the month&apos;s two PDFs</SubHeading>
        <button
          type="button"
          disabled={disabled}
          onClick={() => picker.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`mt-2 w-full rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB81C] disabled:cursor-not-allowed disabled:opacity-50 ${
            over ? "border-[#FFB81C] bg-[#0F2D52]" : "border-[#FFB81C]/50 bg-[#07152E]"
          }`}
        >
          Drop the two PDFs here, or press to choose them
        </button>
        <input ref={picker} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => choose(e.target.files)} />
        {files.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-slate-200">
            {files.map((f) => (
              <li key={f.name} className="break-words">
                {f.name} <span className="text-slate-400">({Math.round(f.size / 1024).toLocaleString("en-US")} KB)</span>
              </li>
            ))}
          </ul>
        )}
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" className="mt-1" checked={replace} disabled={disabled} onChange={(e) => setReplace(e.target.checked)} />
          Replace a month that&apos;s already in the files
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={gold} disabled={disabled || files.length === 0} onClick={check}>
            Check the PDFs
          </button>
          <button type="button" className={ghost} disabled={disabled || !checked?.id} onClick={apply}>
            Apply: replace the 3 files and run the checks
          </button>
        </div>
      </Panel>

      <div aria-live="polite" className="space-y-3">
        {(busy === "check" || busy === "apply") && working(busy)}
        {error && errorBox(error)}
        {checked && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-emerald-200">Checked. Nothing has changed yet; press Apply to replace the files.</p>
            {(checked.bigChanges ?? []).map((w) => (
              <p key={w} className="rounded-md border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-amber-100">
                {w}
              </p>
            ))}
            <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-400/20 bg-[#07152E] p-3 text-xs text-slate-200">
              {checked.report}
            </pre>
          </div>
        )}
        {applied && result(applied)}
      </div>

      <Panel>
        <SubHeading>Undo last update</SubHeading>
        <p className="text-sm text-slate-300">
          Puts back the files from before the most recent update, after showing which months it would remove. Backups
          are never deleted.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={ghost} disabled={disabled} onClick={askUndo}>
            Undo last update
          </button>
        </div>
        <div aria-live="polite" className="mt-3 space-y-3">
          {undoInfo && (
            <div className="space-y-3">
              <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-400/20 bg-[#07152E] p-3 text-xs text-slate-200">
                {undoInfo.text}
              </pre>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={gold} disabled={busy !== null} onClick={confirmUndo}>
                  Yes, undo it
                </button>
                <button type="button" className={ghost} disabled={busy !== null} onClick={() => setUndoInfo(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {(busy === "undo-info" || busy === "undo") && working(busy)}
          {undoError && errorBox(undoError)}
          {undone && result(undone)}
        </div>
      </Panel>
    </div>
  );
}

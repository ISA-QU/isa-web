"use client";

import type { ReactNode } from "react";

/**
 * QU-branded primitives, ported from utils/theme.py's CSS classes to Tailwind.
 * `kpi-card`, `panel`, `qu-divider`, `methodology-note` and friends all live
 * here so the tabs read as layout rather than styling.
 */

const CARD_SURFACE =
  "rounded-lg border bg-[linear-gradient(180deg,rgba(14,37,76,0.92),rgba(5,16,34,0.88))] " +
  "shadow-[0_18px_48px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)]";

export type Accent = "default" | "gold" | "navy";

const ACCENT_BORDER: Record<Accent, string> = {
  default: "border-slate-400/20",
  gold: "border-[rgba(255,184,28,0.42)]",
  navy: "border-[rgba(61,141,222,0.42)]",
};

export function KpiCard({
  label,
  value,
  delta,
  deltaTone = "neutral",
  accent = "default",
  valueClassName = "",
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: "pos" | "neg" | "neutral";
  accent?: Accent;
  valueClassName?: string;
}) {
  const deltaColor =
    deltaTone === "pos" ? "text-[#4ade80]" : deltaTone === "neg" ? "text-[#f87171]" : "text-slate-300";

  return (
    <div
      className={`group relative min-h-[118px] overflow-visible p-5 transition duration-150 hover:-translate-y-0.5 hover:border-[rgba(255,184,28,0.44)] ${CARD_SURFACE} ${ACCENT_BORDER[accent]}`}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,rgba(255,184,28,0.9),rgba(61,141,222,0.72))] opacity-60"
      />
      <div
        className={`text-[clamp(22px,1.85vw,28px)] font-extrabold leading-[1.08] text-white [overflow-wrap:anywhere] ${valueClassName}`}
      >
        {value}
      </div>
      <div className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#93a4ba]">
        {label}
      </div>
      {delta !== undefined && delta !== null && (
        <div className={`mt-2 text-xs font-extrabold leading-[1.35] ${deltaColor}`}>{delta}</div>
      )}
    </div>
  );
}

/** `.kpi-row` — auto-fitting grid of KPI cards. */
export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-7 grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      {children}
    </div>
  );
}

export function Panel({
  children,
  accent = "default",
  className = "",
}: {
  children: ReactNode;
  accent?: Accent | "gold-panel";
  className?: string;
}) {
  const border =
    accent === "gold" || accent === "gold-panel"
      ? "border-[rgba(255,184,28,0.36)]"
      : accent === "navy"
        ? "border-[rgba(61,141,222,0.36)]"
        : "border-slate-400/20";
  return <div className={`mb-[18px] p-[22px] ${CARD_SURFACE} ${border} ${className}`}>{children}</div>;
}

export function Divider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`my-[30px] h-px bg-[linear-gradient(90deg,transparent,rgba(255,184,28,0.56),transparent)] ${className}`}
    />
  );
}

export function MethodologyNote({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`mb-3 text-[12px] leading-relaxed text-slate-400 ${wide ? "" : "mx-auto max-w-[900px]"}`}
    >
      {children}
    </div>
  );
}

/** `.rankings-scope-note` — the "<b>Label</b> · body" strip above a table. */
export function ScopeNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-md border border-slate-400/20 bg-white/[0.03] px-3 py-2 text-[12px] text-slate-300">
      <b className="text-slate-100">{label}</b> · {children}
    </div>
  );
}

export function InsightChip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "gold" }) {
  const styles =
    tone === "gold"
      ? "border-[rgba(255,184,28,0.4)] bg-[rgba(255,184,28,0.12)] text-[#ffdf87]"
      : "border-[rgba(61,141,222,0.4)] bg-[rgba(61,141,222,0.12)] text-[#bfdcff]";
  return (
    <span className={`mr-2 mb-2 inline-flex items-center rounded-full border px-2.5 py-1.5 text-xs font-extrabold ${styles}`}>
      {children}
    </span>
  );
}

/** Section heading with the `###`-level weight Streamlit used. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-lg font-bold text-white">{children}</h3>;
}

/** Collapsible, replacing `st.expander`. */
export function Expander({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="mb-3 rounded-lg border border-slate-400/20 bg-white/[0.02] px-4 py-3 text-sm text-slate-300"
    >
      <summary className="cursor-pointer list-none font-semibold text-slate-100 marker:hidden">
        {title}
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align and use tabular figures. */
  numeric?: boolean;
  render: (row: T) => ReactNode;
  width?: string;
}

/** `show_table()` — dark scrollable table with a sticky header. */
export function DataTable<T>({
  rows,
  columns,
  height,
  rowKey,
  empty = "No rows match the selected filters.",
}: {
  rows: readonly T[];
  columns: readonly Column<T>[];
  height: number;
  rowKey: (row: T, index: number) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-400/30 bg-white/[0.02] p-6 text-center text-sm text-slate-400">
        {empty}
      </div>
    );
  }

  return (
    <div
      className="overflow-auto rounded-lg border border-slate-400/20 bg-[#07152E]"
      style={{ maxHeight: height }}
    >
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#0D2B55] text-left">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`whitespace-nowrap px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white ${
                  column.numeric ? "text-right" : ""
                }`}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="border-t border-slate-400/[0.18] text-[#E5EDF7]">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-2 ${column.numeric ? "text-right tabular-nums" : ""}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Form controls, replacing Streamlit's sidebar widgets --------------- */

const CONTROL =
  "w-full rounded-md border border-slate-400/25 bg-[#07152E] px-3 py-2 text-sm text-slate-100 " +
  "transition focus:border-[#FFB81C] focus:outline-none focus:ring-2 focus:ring-[#FFB81C]/25";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#93a4ba]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select className={CONTROL} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option} value={option} className="bg-[#07152E]">
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function RadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <div className="inline-flex rounded-md border border-slate-400/25 bg-[#07152E] p-0.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
              value === option
                ? "bg-[#FFB81C] text-[#0C2340]"
                : "text-slate-300 hover:bg-white/5"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <Field label={`${label}: ${format(value)}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#FFB81C]"
      />
    </Field>
  );
}

/** Checkbox list replacing `st.multiselect`. */
export function MultiSelect({
  label,
  values,
  options,
  onChange,
  maxHeight = 180,
}: {
  label: string;
  values: readonly string[];
  options: readonly string[];
  onChange: (values: string[]) => void;
  maxHeight?: number;
}) {
  const selected = new Set(values);
  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(options.filter((o) => next.has(o)));
  };

  return (
    <Field label={`${label} (${values.length}/${options.length})`}>
      <div
        className="space-y-1 overflow-y-auto rounded-md border border-slate-400/25 bg-[#07152E] p-2"
        style={{ maxHeight }}
      >
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-200 hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={selected.has(option)}
              onChange={() => toggle(option)}
              className="accent-[#FFB81C]"
            />
            {option}
          </label>
        ))}
      </div>
    </Field>
  );
}

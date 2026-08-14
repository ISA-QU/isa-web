"use client";

import type { ReactNode } from "react";

import { Expander, MethodologyNote } from "./ui";

/** `data_scope_notice()` from app.py. */
export function DataScopeNotice() {
  return (
    <MethodologyNote wide>
      2025 monthly data is partial through September. Annual country history currently ends at
      FY2024. Visa issuance volume is a historical mobility and consular-workload signal, not
      individual approval probability and not Quinnipiac enrollment data.
    </MethodologyNote>
  );
}

/** `methodology_expanders()` from app.py. */
export function MethodologyExpanders({
  includeMarket = true,
  includeOpportunity = false,
}: {
  includeMarket?: boolean;
  includeOpportunity?: boolean;
}) {
  return (
    <Expander title="How this is calculated">
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <b>Recovery Index:</b> comparable annual or Jan-Sep issuance divided by the 2019 baseline
          times 100; shown as N/A when the 2019 baseline is not positive.
        </li>
        <li>
          <b>Volatility:</b> monthly coefficient of variation. High &gt;= 0.85; moderate &gt;= 0.45;
          otherwise low.
        </li>
        <li>
          <b>Seasonality Strength:</b> peak calendar-month average divided by average monthly
          issuance. High &gt;= 2.0x; moderate &gt;= 1.4x; otherwise low.
        </li>
        <li>
          <b>Top-One Share:</b> the largest canonical post&apos;s share of selected country/post
          issuance.
        </li>
        <li>
          <b>Top-Three Share:</b> the three largest canonical posts&apos; combined share of selected
          country/post issuance.
        </li>
        <li>
          <b>Data Confidence:</b> high when operational, annual country, and historical consulate
          layers are all present and comparable; reduced when key baselines or recent volumes are
          missing.
        </li>
        <li>
          <b>Recommendation:</b> deterministic rule output using primary category, long-term growth,
          recent momentum, recovery, seasonality, concentration, volatility, and data confidence.
        </li>
        {includeMarket && (
          <>
            <li>
              <b>Market Category:</b> one mutually exclusive primary label. Core is checked first for
              large strategic markets unless both long-term and recent evidence support structural
              decline. Declining requires both negative 10-year growth &lt;= -35% and recent
              momentum &lt;= -20%.
            </li>
            <li>
              <b>Secondary Flags:</b> multiple non-exclusive flags can coexist, including Strong
              Long-Term Growth, Weak Recent Momentum, Recovery Leader, Highly Seasonal, High
              Concentration, Volatile, Travel Opportunity, Low Confidence, and Partial-Year Caution.
            </li>
          </>
        )}
        {includeOpportunity && (
          <li>
            <b>Prototype Opportunity Score:</b> legacy directional score from current volume,
            comparable growth, and seasonality. It is not a finalized institutional score.
          </li>
        )}
      </ul>
    </Expander>
  );
}

/** `st.info(...)` — the blue callout used when a filter matches nothing. */
export function InfoCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-[rgba(61,141,222,0.35)] bg-[rgba(61,141,222,0.1)] p-4 text-sm text-[#bfdcff]">
      {children}
    </div>
  );
}

export function ErrorCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-200">
      {children}
    </div>
  );
}

/** Replaces `st.download_button` — builds a CSV client-side and downloads it. */
export function DownloadCsvButton({
  label,
  filename,
  headers,
  rows,
}: {
  label: string;
  filename: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  const download = () => {
    const escape = (cell: string) =>
      /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={download}
      className="mt-3 rounded-md border border-[rgba(255,184,28,0.45)] bg-[rgba(255,184,28,0.12)] px-3.5 py-2 text-sm font-semibold text-[#FFB81C] transition hover:bg-[rgba(255,184,28,0.2)] focus:outline-none focus:ring-2 focus:ring-[#FFB81C]/40"
    >
      {label}
    </button>
  );
}

/** `#### Heading` — the sub-section heading Streamlit rendered inside tabs. */
export function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 mt-1 text-base font-bold text-white">{children}</h4>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs text-slate-500">{children}</p>;
}

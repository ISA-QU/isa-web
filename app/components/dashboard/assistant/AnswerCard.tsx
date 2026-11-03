"use client";

import { useState } from "react";

import { resultText } from "../../../lib/dashboard/assistant/format";
import { TAB_LABELS, sourceText, type TabLink, type ToolResult } from "../../../lib/dashboard/assistant/types";
import Flag from "./Flag";

/**
 * One tool result as a card. The lines are the tool's text unchanged, so the
 * numbers and their formatting match the tabs exactly.
 */
export default function AnswerCard({ card, onOpen }: { card: ToolResult; onOpen: (link: TabLink) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resultText(card));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const buttons = [
    ...(card.link ? [{ label: `Open ${TAB_LABELS[card.link.tab]}`, link: card.link }] : []),
    ...(card.actions ?? []),
  ];
  const button =
    "rounded-md border border-slate-400/30 px-2.5 py-1 text-xs font-semibold text-slate-100 transition hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB81C]";

  return (
    <article className="rounded-lg border border-slate-400/20 bg-[#0B1C38] p-3 text-sm">
      <h3 className="flex items-start gap-2 font-bold text-white">
        {card.country && <Flag country={card.country} className="mt-[3px]" />}
        <span>{card.title}</span>
      </h3>
      <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-[#DDEBFA]">
        {card.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {(card.notes ?? []).map((note, i) => (
        <p key={i} className="mt-2 text-xs leading-relaxed text-slate-400">
          {note}
        </p>
      ))}
      <div className="mt-2 space-y-0.5 text-[11px] leading-relaxed text-slate-400">
        {card.sources.map((s, i) => (
          <p key={i}>
            <span className="font-semibold text-slate-300">Source:</span> {sourceText(s)}
          </p>
        ))}
        {(card.links ?? []).map((l) => (
          <p key={l.url}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="break-words text-sky-300 underline">
              {l.label}
            </a>
          </p>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button key={`${b.label}-${b.link.tab}`} type="button" className={button} onClick={() => onOpen(b.link)}>
            {b.label}
          </button>
        ))}
        <button type="button" className={button} onClick={copy} aria-label={`Copy "${card.title}"`}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </article>
  );
}

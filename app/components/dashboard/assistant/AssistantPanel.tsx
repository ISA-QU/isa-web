"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { answerQuestion, type Answer, type Memory } from "../../../lib/dashboard/assistant/answer";
import { ROTATING_GREETINGS, greetingFor } from "../../../lib/dashboard/assistant/greetings";
import { welcomeSuggestions, type Suggestion } from "../../../lib/dashboard/assistant/suggestions";
import type { TabLink } from "../../../lib/dashboard/assistant/types";
import { DEFAULT_PERIOD } from "../../../lib/dashboard/periods";
import { useDashboard } from "../DashboardContext";
import type { OpenTab } from "../TabNavigation";
import AnswerCard from "./AnswerCard";
import BobcatIcon from "./BobcatIcon";
import Flag from "./Flag";

/** A chat turn. History lives in this component's memory only: nothing is stored or sent anywhere. */
type Turn = { id: number; question: string; answer: Answer };

const MAX_QUESTION = 300;

/**
 * The Bobcat panel (loaded on first open). Answers come only from the loaded
 * dashboard data: no model, no network. 380 × 560 on desktop; a full-screen
 * sheet under 640 px. Escape closes; Tab stays inside the panel.
 */
export default function AssistantPanel({ onClose, openTab }: { onClose: () => void; openTab: OpenTab }) {
  const { data, visa, focusCountry, setFocusCountry, setVisa, setPeriod } = useDashboard();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [draft, setDraft] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // The greeting: the selected country's language, or rotating when it has none (still under reduced motion).
  const fixed = greetingFor(focusCountry);
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    if (fixed) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setRotation((i) => (i + 1) % ROTATING_GREETINGS.length), 3000);
    return () => window.clearInterval(timer);
  }, [fixed]);
  const greeting = fixed ?? ROTATING_GREETINGS[rotation];

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  const ask = (text: string) => {
    const question = text.trim().slice(0, MAX_QUESTION);
    if (!question) return;
    const { answer, memory: next } = answerQuestion(question, { data, visa, focusCountry }, memory);
    setTurns((list) => [...list, { id: nextId.current++, question, answer }]);
    setMemory(next);
    setDraft("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  /** "Open tab": set the country, visa and period the answer used, then switch tabs. */
  const open = (link: TabLink) => {
    if (link.country) setFocusCountry(link.country);
    if (link.visa) setVisa(link.visa);
    if (link.period === "last12") setPeriod(DEFAULT_PERIOD);
    openTab(link.tab, link.params);
    if (window.matchMedia?.("(max-width: 639px)").matches) onClose();
  };

  // Escape closes; Tab and Shift+Tab cycle inside the panel.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex]:not([tabindex='-1'])")].filter(
      (el) => !el.hasAttribute("disabled"),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const chips = (list: Suggestion[]) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((s) => (
        <button
          key={s.text}
          type="button"
          onClick={() => ask(s.text)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#FFB81C]/40 bg-[#FFB81C]/[0.07] px-2.5 py-1 text-left text-xs text-[#FFE3A3] transition hover:bg-[#FFB81C]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB81C]"
        >
          {s.country && <Flag country={s.country} />}
          {s.text}
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={panel}
      id="bobcat-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bobcat-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden border-slate-400/25 bg-[#07152E] text-slate-200 shadow-2xl print:hidden sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[560px] sm:max-h-[calc(100vh-7rem)] sm:w-[380px] sm:rounded-xl sm:border"
    >
      <header className="flex items-center gap-3 border-b border-slate-400/20 bg-[#0C2340] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BobcatIcon size={36} />
        <div className="min-w-0 flex-1">
          <h2 id="bobcat-title" className="text-sm font-extrabold text-white">
            <span title={greeting.language}>
              {greeting.text}!
            </span>{" "}
            I&apos;m the Bobcat.
          </h2>
          <p className="text-[11px] text-slate-300">Answers come only from this dashboard&apos;s data.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Bobcat assistant"
          className="rounded-md px-2 py-1 text-lg leading-none text-slate-300 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB81C]"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">
              Ask about a country, the markets, travel bans, events, history, or how to use a tab. Try:
            </p>
            {chips(welcomeSuggestions(focusCountry))}
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-[#FFB81C] px-3 py-1.5 text-sm font-medium text-[#0C2340]">
              {turn.question}
            </p>
            {turn.answer.intro && <p className="text-sm text-slate-200">{turn.answer.intro}</p>}
            {turn.answer.cards.map((card, i) => (
              <AnswerCard key={i} card={card} onOpen={open} />
            ))}
            {turn.answer.notes.map((note) => (
              <p key={note} className="text-xs leading-relaxed text-slate-400">
                {note}
              </p>
            ))}
            {turn.answer.kind !== "answer" && chips(turn.answer.suggestions)}
          </div>
        ))}
        <div ref={end} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-slate-400/20 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <label htmlFor="bobcat-input" className="sr-only">
          Ask the Bobcat
        </label>
        <input
          ref={input}
          id="bobcat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_QUESTION}
          autoComplete="off"
          placeholder="Ask about the dashboard…"
          className="min-w-0 flex-1 rounded-md border border-slate-400/25 bg-[#050F22] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#FFB81C] focus:outline-none focus:ring-2 focus:ring-[#FFB81C]/25"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-md bg-[#FFB81C] px-3 py-2 text-sm font-bold text-[#0C2340] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

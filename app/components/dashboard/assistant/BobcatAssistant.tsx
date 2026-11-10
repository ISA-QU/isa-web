"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import type { OpenTab } from "../TabNavigation";
import BobcatLogo from "./BobcatLogo";
import styles from "./assistant.module.css";

/** The panel (and the flags it draws) load only when the button is first pressed. */
const AssistantPanel = dynamic(() => import("./AssistantPanel"), { ssr: false });

/**
 * The Bobcat button, bottom-right on every dashboard tab, and its panel. Free
 * and local: it answers from the loaded dashboard data only. Hidden in print.
 */
export default function BobcatAssistant({ openTab }: { openTab: OpenTab }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="print:hidden">
      {open && <AssistantPanel onClose={close} openTab={openTab} />}
      <button
        ref={button}
        type="button"
        aria-label={open ? "Close Bobcat assistant" : "Open Bobcat assistant"}
        aria-expanded={open}
        aria-controls={open ? "bobcat-panel" : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#FFB81C] bg-[#0C2340] shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FFB81C]/50 ${
          open ? "max-sm:hidden" : styles.hop
        }`}
      >
        <BobcatLogo size={48} />
      </button>
    </div>
  );
}

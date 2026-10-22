"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { MONTH_NAMES } from "../../lib/dashboard/constants";
import type { VisaSelection } from "../../lib/dashboard/types";
import { DEFAULT_COUNTRY, DEFAULT_VISA, useDashboard, visaLabelOf } from "./DashboardContext";

const VISAS: readonly VisaSelection[] = ["F1", "J1", "Both"];

/**
 * The control bar across the top of the dashboard: the shared country, the
 * shared visa, a reset, and a one-line summary of what every tab is showing.
 */
export default function ControlBar() {
  const {
    data,
    allCountries,
    focusCountry,
    setFocusCountry,
    visa,
    setVisa,
    selectedYears,
    allYears,
  } = useDashboard();

  // The years still come from the sidebar filter; the Period control replaces it later.
  const end = data.meta.coverage.postsMonthly.end;
  const endYear = Math.floor(end / 12);
  const endMonth = (end % 12) + 1;
  const years = [...(selectedYears.length > 0 ? selectedYears : allYears)].sort((a, b) => a - b);
  const yearsText = years
    .map((year) =>
      year === endYear && endMonth < 12
        ? `${year} (${endMonth === 1 ? "Jan" : `Jan–${MONTH_NAMES[endMonth]}`})`
        : String(year),
    )
    .join(", ");

  const isDefault = focusCountry === DEFAULT_COUNTRY && visa === DEFAULT_VISA;

  return (
    <section
      aria-label="Dashboard controls"
      className="mb-6 rounded-lg border border-slate-400/20 bg-[#07152E] px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-4">
        <CountryCombobox value={focusCountry} options={allCountries} onChange={setFocusCountry} />
        <VisaGroup value={visa} onChange={setVisa} />
        <button
          type="button"
          onClick={() => {
            setFocusCountry(DEFAULT_COUNTRY);
            setVisa(DEFAULT_VISA);
          }}
          disabled={isDefault}
          className="rounded-md border border-slate-400/30 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#FFB81C] disabled:cursor-default disabled:opacity-40"
        >
          Reset to defaults
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-300" aria-live="polite">
        <span className="font-bold text-slate-100">Showing:</span> {focusCountry} ·{" "}
        {visaLabelOf(visa)} · Years {yearsText}
      </p>
    </section>
  );
}

/** Visa buttons that behave as one radio group: Tab in, arrow keys to move. */
function VisaGroup({
  value,
  onChange,
}: {
  value: VisaSelection;
  onChange: (value: VisaSelection) => void;
}) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + VISAS.length) % VISAS.length;
    onChange(VISAS[next]);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <span
        id={labelId}
        className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#93a4ba]"
      >
        Visa
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="inline-flex rounded-md border border-slate-400/25 bg-[#050F22] p-0.5"
      >
        {VISAS.map((option, index) => {
          const checked = value === option;
          return (
            <button
              key={option}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(option)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#FFB81C] ${
                checked ? "bg-[#FFB81C] text-[#0C2340]" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              {visaLabelOf(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A searchable country picker (ARIA combobox): type to filter, arrow keys to
 * move, Enter to choose, Escape to cancel.
 */
function CountryCombobox({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return options;
    const starts = options.filter((o) => o.toLowerCase().startsWith(q));
    const contains = options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const choose = (country: string) => {
    onChange(country);
    close();
  };

  const moveTo = (index: number) => {
    setActive(index);
    const item = listRef.current?.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(Math.max(matches.indexOf(value), 0));
        return;
      }
      moveTo(Math.min(active + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (open) moveTo(Math.max(active - 1, 0));
    } else if (event.key === "Enter") {
      if (open && matches[active]) {
        event.preventDefault();
        choose(matches[active]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      }
    }
  };

  return (
    <div className="relative w-full sm:w-64">
      <label
        htmlFor={inputId}
        className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#93a4ba]"
      >
        Country
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query ?? value}
        onFocus={(event) => event.currentTarget.select()}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
        className="w-full rounded-md border border-slate-400/25 bg-[#050F22] px-3 py-2 text-sm text-slate-100 transition focus:border-[#FFB81C] focus:outline-none focus:ring-2 focus:ring-[#FFB81C]/25"
      />
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Countries"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-400/25 bg-[#07152E] py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">No matching country</li>
          ) : (
            matches.map((country, index) => (
              <li
                key={country}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={country === value}
                // Choose on mousedown so the input's blur doesn't close the list first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(country);
                }}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  index === active ? "bg-white/10 text-white" : "text-slate-200"
                } ${country === value ? "font-bold" : ""}`}
              >
                {country}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

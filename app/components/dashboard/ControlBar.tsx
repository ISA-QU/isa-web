"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { MONTH_NAMES } from "../../lib/dashboard/constants";
import { DEFAULT_PERIOD, calendarYearOptions, type PeriodChoice } from "../../lib/dashboard/periods";
import type { VisaSelection } from "../../lib/dashboard/types";
import { DEFAULT_COUNTRY, DEFAULT_VISA, useDashboard, visaLabelOf } from "./DashboardContext";

const VISAS: readonly VisaSelection[] = ["F1", "J1", "Both"];

/**
 * The control bar across the top of the dashboard: the shared country, visa and
 * period, a reset, and a one-line summary of what every tab is showing. On
 * Historical Trends (annual nationality data) the Period slot holds a
 * fiscal-year range instead.
 */
export default function ControlBar({ fiscalYearMode }: { fiscalYearMode: boolean }) {
  const {
    allCountries,
    focusCountry,
    setFocusCountry,
    visa,
    setVisa,
    period,
    setPeriod,
    periodRange,
    fyRange,
    setFyRange,
    fyBounds,
    provisionalYears,
  } = useDashboard();

  const isDefault =
    focusCountry === DEFAULT_COUNTRY &&
    visa === DEFAULT_VISA &&
    period.kind === DEFAULT_PERIOD.kind &&
    fyRange.start === fyBounds.first &&
    fyRange.end === fyBounds.latest;

  const provisionalInRange = [...provisionalYears]
    .filter((year) => year >= fyRange.start && year <= fyRange.end)
    .sort((a, b) => a - b);
  const fyText = `FY${fyRange.start} – FY${fyRange.end}${
    provisionalInRange.length > 0
      ? ` (${provisionalInRange.map((y) => `FY${y}`).join(", ")} provisional)`
      : ""
  }`;

  return (
    <section
      aria-label="Dashboard controls"
      className="mb-6 rounded-lg border border-slate-400/20 bg-[#07152E] px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-4">
        <CountryCombobox value={focusCountry} options={allCountries} onChange={setFocusCountry} />
        {fiscalYearMode ? (
          <FiscalYearRange
            value={fyRange}
            bounds={fyBounds}
            provisional={provisionalYears}
            onChange={setFyRange}
          />
        ) : (
          <>
            <VisaGroup value={visa} onChange={setVisa} />
            <PeriodControl value={period} onChange={setPeriod} />
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setFocusCountry(DEFAULT_COUNTRY);
            setVisa(DEFAULT_VISA);
            setPeriod(DEFAULT_PERIOD);
            setFyRange({ start: fyBounds.first, end: fyBounds.latest });
          }}
          disabled={isDefault}
          className="rounded-md border border-slate-400/30 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#FFB81C] disabled:cursor-default disabled:opacity-40"
        >
          Reset to defaults
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-300" aria-live="polite">
        <span className="font-bold text-slate-100">Showing:</span> {focusCountry} ·{" "}
        {fiscalYearMode
          ? `F1 and J1 by nationality · ${fyText}`
          : `${visaLabelOf(visa)} · ${periodRange.label}`}
      </p>
    </section>
  );
}

const fieldLabel =
  "mb-1 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#93a4ba]";
const selectClass =
  "rounded-md border border-slate-400/25 bg-[#050F22] px-3 py-2 text-sm text-slate-100 transition focus:border-[#FFB81C] focus:outline-none focus:ring-2 focus:ring-[#FFB81C]/25";

/** Period for the monthly consulate data: presets, a calendar year, or custom months. */
function PeriodControl({
  value,
  onChange,
}: {
  value: PeriodChoice;
  onChange: (value: PeriodChoice) => void;
}) {
  const { data } = useDashboard();
  const coverage = data.meta.coverage.postsMonthly;
  const kindId = useId();
  const yearId = useId();
  const startId = useId();
  const endId = useId();

  const years = useMemo(() => calendarYearOptions(coverage), [coverage]);
  const months = useMemo(() => {
    const list: number[] = [];
    for (let index = coverage.start; index <= coverage.end; index += 1) list.push(index);
    return list;
  }, [coverage]);
  const monthLabel = (index: number) =>
    `${MONTH_NAMES[(index % 12) + 1]} ${Math.floor(index / 12)}`;

  const kinds: { kind: PeriodChoice["kind"]; label: string }[] = [
    { kind: "last12", label: "Last 12 months" },
    { kind: "last24", label: "Last 24 months" },
    { kind: "year", label: "Calendar year" },
    { kind: "custom", label: "Custom months" },
    { kind: "all", label: `All (since ${monthLabel(coverage.start)})` },
    { kind: "pandemic", label: "Pre-pandemic through recovery (2019–2022)" },
  ];

  const chooseKind = (kind: PeriodChoice["kind"]) => {
    if (kind === "year") onChange({ kind, year: years[years.length - 1]?.year ?? Math.floor(coverage.end / 12) });
    else if (kind === "custom") onChange({ kind, start: Math.max(coverage.end - 11, coverage.start), end: coverage.end });
    else onChange({ kind });
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor={kindId} className={fieldLabel}>
          Period
        </label>
        <select
          id={kindId}
          value={value.kind}
          onChange={(event) => chooseKind(event.target.value as PeriodChoice["kind"])}
          className={selectClass}
        >
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind} className="bg-[#07152E]">
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {value.kind === "year" && (
        <div>
          <label htmlFor={yearId} className={fieldLabel}>
            Year
          </label>
          <select
            id={yearId}
            value={value.year}
            onChange={(event) => onChange({ kind: "year", year: Number(event.target.value) })}
            className={selectClass}
          >
            {years.map((y) => (
              <option key={y.year} value={y.year} className="bg-[#07152E]">
                {y.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {value.kind === "custom" && (
        <>
          <div>
            <label htmlFor={startId} className={fieldLabel}>
              From
            </label>
            <select
              id={startId}
              value={value.start}
              onChange={(event) => {
                const start = Number(event.target.value);
                onChange({ kind: "custom", start, end: Math.max(start, value.end) });
              }}
              className={selectClass}
            >
              {months.map((m) => (
                <option key={m} value={m} className="bg-[#07152E]">
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={endId} className={fieldLabel}>
              To
            </label>
            <select
              id={endId}
              value={value.end}
              onChange={(event) => {
                const end = Number(event.target.value);
                onChange({ kind: "custom", start: Math.min(value.start, end), end });
              }}
              className={selectClass}
            >
              {months.map((m) => (
                <option key={m} value={m} className="bg-[#07152E]">
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

/** Fiscal-year range for the annual nationality data (Historical Trends). */
function FiscalYearRange({
  value,
  bounds,
  provisional,
  onChange,
}: {
  value: { start: number; end: number };
  bounds: { first: number; latest: number };
  provisional: ReadonlySet<number>;
  onChange: (value: { start: number; end: number }) => void;
}) {
  const fromId = useId();
  const toId = useId();
  const years: number[] = [];
  for (let year = bounds.first; year <= bounds.latest; year += 1) years.push(year);
  const label = (year: number) => `FY${year}${provisional.has(year) ? " (provisional)" : ""}`;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor={fromId} className={fieldLabel}>
          Fiscal years from
        </label>
        <select
          id={fromId}
          value={value.start}
          onChange={(event) => {
            const start = Number(event.target.value);
            onChange({ start, end: Math.max(start, value.end) });
          }}
          className={selectClass}
        >
          {years.map((y) => (
            <option key={y} value={y} className="bg-[#07152E]">
              {label(y)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={toId} className={fieldLabel}>
          To
        </label>
        <select
          id={toId}
          value={value.end}
          onChange={(event) => {
            const end = Number(event.target.value);
            onChange({ start: Math.min(value.start, end), end });
          }}
          className={selectClass}
        >
          {years.map((y) => (
            <option key={y} value={y} className="bg-[#07152E]">
              {label(y)}
            </option>
          ))}
        </select>
      </div>
    </div>
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

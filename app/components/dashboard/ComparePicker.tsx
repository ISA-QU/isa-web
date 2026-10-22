"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export interface ComparePreset {
  label: string;
  values: readonly string[];
}

/**
 * Pick up to `max` items to compare: type to search, Enter or click to add a
 * removable chip, Backspace on an empty box removes the last chip, and preset
 * buttons replace the selection in one step.
 */
export default function ComparePicker({
  label,
  options,
  value,
  onChange,
  presets = [],
  max = 8,
  noun = "items",
}: {
  label: string;
  options: readonly string[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  presets?: readonly ComparePreset[];
  max?: number;
  /** Plural noun for messages, e.g. "countries". */
  noun?: string;
}) {
  const inputId = useId();
  const listId = useId();
  const noteId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = value.length >= max;
  const selected = useMemo(() => new Set(value), [value]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = options.filter((o) => !selected.has(o));
    if (!q) return available;
    const starts = available.filter((o) => o.toLowerCase().startsWith(q));
    const contains = available.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [options, query, selected]);

  const add = (item: string) => {
    if (atLimit) {
      setAnnouncement(`Limit of ${max} reached. Remove one to add ${item}.`);
      return;
    }
    onChange([...value, item]);
    setAnnouncement(`${item} added.`);
    setQuery("");
    setActive(0);
  };

  const remove = (item: string) => {
    onChange(value.filter((v) => v !== item));
    setAnnouncement(`${item} removed.`);
    inputRef.current?.focus();
  };

  const moveTo = (index: number) => {
    setActive(index);
    const element = listRef.current?.children[index] as HTMLElement | undefined;
    element?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveTo(Math.min(active + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (open) moveTo(Math.max(active - 1, 0));
    } else if (event.key === "Enter") {
      if (open && matches[active]) {
        event.preventDefault();
        add(matches[active]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    } else if (event.key === "Backspace" && query === "" && value.length > 0) {
      event.preventDefault();
      remove(value[value.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#93a4ba]">
        {label} ({value.length}/{max})
      </label>

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${label} presets`}>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                const next = preset.values.slice(0, max);
                onChange([...next]);
                setAnnouncement(`${preset.label}: ${next.join(", ") || "no matches"}.`);
              }}
              className="rounded-full border border-slate-400/30 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#FFB81C]"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-400/25 bg-[#07152E] p-1.5 focus-within:border-[#FFB81C]">
        <ul className="contents" aria-label={`Selected ${noun}`}>
          {value.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,184,28,0.16)] py-0.5 pl-2.5 pr-1 text-xs font-semibold text-[#ffdf87]"
            >
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Remove ${item}`}
                className="rounded-full px-1 leading-none text-[#ffdf87] hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FFB81C]"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="relative min-w-[10rem] flex-1">
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-describedby={noteId}
            aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={atLimit ? `Limit of ${max} reached` : `Type to add ${noun}…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="w-full bg-transparent px-1.5 py-1 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {open && !atLimit && (
            <ul
              id={listId}
              ref={listRef}
              role="listbox"
              aria-label={`Available ${noun}`}
              className="absolute left-0 z-30 mt-1 max-h-60 w-full min-w-[14rem] overflow-y-auto rounded-md border border-slate-400/25 bg-[#07152E] py-1 shadow-lg"
            >
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
              ) : (
                matches.map((item, index) => (
                  <li
                    key={item}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      add(item);
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={`cursor-pointer px-3 py-1.5 text-sm ${
                      index === active ? "bg-white/10 text-white" : "text-slate-200"
                    }`}
                  >
                    {item}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      <p id={noteId} className="text-xs text-slate-400" aria-live="polite">
        {atLimit
          ? `Limit of ${max} reached. Remove one (✕ or Backspace) to add another.`
          : announcement || `Enter adds the highlighted match; Backspace removes the last one.`}
      </p>
    </div>
  );
}

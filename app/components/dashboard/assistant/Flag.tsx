"use client";

import { useEffect, useState } from "react";

import { flagCode } from "../../../lib/dashboard/assistant/flags";

/**
 * A country's flag from country-flag-icons (MIT). The flag set is imported the
 * first time a flag is drawn, so it loads with the panel, never with the
 * dashboard. Shown as an image from the SVG text (no markup injected), and
 * decorative: the country's name is always written next to it.
 */
type FlagSet = Record<string, string>;
let flagsPromise: Promise<FlagSet> | null = null;
const loadFlags = () => {
  flagsPromise ??= import("country-flag-icons/string/3x2").then((mod) => mod as unknown as FlagSet);
  return flagsPromise;
};

export default function Flag({ country, className = "" }: { country: string | null | undefined; className?: string }) {
  const code = flagCode(country);
  const [svg, setSvg] = useState<{ code: string; svg: string } | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    loadFlags()
      .then((flags) => {
        if (!cancelled && flags[code]) setSvg({ code, svg: flags[code] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!code) return null;
  const current = svg && svg.code === code ? svg.svg : null;
  return current ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, nothing for next/image to optimise
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(current)}`}
      alt=""
      aria-hidden="true"
      width={21}
      height={14}
      className={`inline-block h-[14px] w-[21px] shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.15)] ${className}`}
    />
  ) : (
    <span aria-hidden="true" className={`inline-block h-[14px] w-[21px] shrink-0 rounded-[2px] bg-white/10 ${className}`} />
  );
}

"use client";

import { useState } from "react";

import { asset } from "../../../lib/basePath";
import BobcatIcon from "./BobcatIcon";

/** The official Bobcat logo, supplied by the office (never drawn or traced here). */
export const BOBCAT_LOGO_SRC = "/brand/bobcat-official.png";

/**
 * The official logo in a navy circle with a small gold globe badge. The
 * placeholder BobcatIcon shows until the image has loaded, and stays if it
 * fails, so there's never a broken image. Decorative: the button and the dialog
 * carry the labels.
 */
export default function BobcatLogo({ size = 44 }: { size?: number }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const badge = Math.round(size * 0.4);

  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-[#0C2340]"
      style={{ width: size, height: size }}
    >
      {!loaded && <BobcatIcon size={Math.round(size * 0.78)} />}
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element -- a static export: next/image can't optimise it
        <img
          src={asset(BOBCAT_LOGO_SRC)}
          alt=""
          ref={(img) => {
            // An image already in the cache may finish before React attaches onLoad.
            if (img?.complete && img.naturalWidth > 0 && !loaded) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={loaded ? "h-[80%] w-[80%] rounded-full object-contain" : "absolute h-0 w-0 opacity-0"}
        />
      )}
      {/* Gold globe badge, bottom-right. */}
      <svg
        width={badge}
        height={badge}
        viewBox="0 0 20 20"
        focusable="false"
        className="absolute -bottom-0.5 -right-0.5"
      >
        <circle cx="10" cy="10" r="9.5" fill="#FFB81C" stroke="#0C2340" strokeWidth="1" />
        <g fill="none" stroke="#0C2340" strokeWidth="1.2">
          <circle cx="10" cy="10" r="6" />
          <ellipse cx="10" cy="10" rx="2.6" ry="6" />
          <path d="M4 10h12M5 6.8h10M5 13.2h10" />
        </g>
      </svg>
    </span>
  );
}

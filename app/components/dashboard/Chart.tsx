"use client";

import { useEffect, useRef, useState } from "react";
import type { Config, Data, Layout } from "plotly.js";

/**
 * Plotly is ~1MB, so it is imported on demand and shared across every chart
 * rather than bundled into the initial payload. `/transcript` and `/calculator`
 * never touch this module and so never pay for it.
 */
let plotlyPromise: Promise<typeof import("plotly.js-dist-min").default> | null = null;

function loadPlotly() {
  plotlyPromise ??= import("plotly.js-dist-min").then((mod) => mod.default ?? mod);
  return plotlyPromise;
}

/**
 * `@types/plotly.js` does not model the whole API surface the Streamlit charts
 * used — `mode: "markers+text"`, partial animation frames and several trace
 * types are all rejected by it. Traces and layouts are therefore described
 * structurally here and narrowed at the single call into Plotly, instead of
 * casting at every one of the ~30 chart definitions.
 */
export type Trace = Record<string, unknown>;
export type ChartLayout = Record<string, unknown>;
export type ChartFrame = Record<string, unknown>;

/** PLOTLY_THEME + polish_chart() from the Streamlit dashboard, merged. */
const BASE_LAYOUT: ChartLayout = {
  template: "plotly_dark",
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(5, 16, 34, 0.45)",
  font: { family: "Inter, sans-serif", color: "#DDEBFA", size: 12 },
  margin: { l: 34, r: 24, t: 72, b: 44 },
  legend: { bgcolor: "rgba(0,0,0,0)", font: { color: "#DDEBFA", size: 12 } },
  hoverlabel: {
    bgcolor: "#07152E",
    bordercolor: "#FFB81C",
    font: { color: "#FFFFFF", size: 12 },
  },
};

const BASE_TITLE = {
  font: { color: "#FFFFFF", size: 18, family: "Inter, sans-serif" },
  x: 0.01,
  xanchor: "left",
};

const AXIS_STYLE = {
  title: { font: { color: "#EAF4FF", size: 13 } },
  tickfont: { color: "#CBD5E1", size: 11 },
  gridcolor: "rgba(255,255,255,0.07)",
  zerolinecolor: "rgba(255,255,255,0.14)",
};

/** PLOTLY_CONFIG from app.py. */
const BASE_CONFIG: Partial<Config> = {
  displayModeBar: "hover",
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
  responsive: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Shallow-merge one level deeper for the nested style objects. */
function mergeNested(base: unknown, override: unknown): Record<string, unknown> {
  const left = isRecord(base) ? base : {};
  const right = isRecord(override) ? override : {};
  return { ...left, ...right };
}

function mergeAxis(axis: unknown): Record<string, unknown> {
  const override = isRecord(axis) ? axis : {};
  return {
    ...AXIS_STYLE,
    ...override,
    title: mergeNested(AXIS_STYLE.title, override.title),
  };
}

export interface ChartProps {
  data: Trace[];
  layout?: ChartLayout;
  config?: Partial<Config>;
  /** Animation frames — used by the Executive tab's rotating globe. */
  frames?: ChartFrame[];
  /** Chart height in pixels. Streamlit charts default to 450. */
  height?: number;
  className?: string;
  /** Accessible description; falls back to the layout title. */
  ariaLabel?: string;
}

export default function Chart({
  data,
  layout,
  config,
  frames,
  height = 450,
  className = "",
  ariaLabel,
}: ChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const element = container.current;
    if (!element) return;

    loadPlotly()
      .then(async (Plotly) => {
        if (cancelled) return;

        const merged: ChartLayout = {
          ...BASE_LAYOUT,
          ...layout,
          height,
          title: mergeNested(BASE_TITLE, layout?.title),
          legend: mergeNested(BASE_LAYOUT.legend, layout?.legend),
          margin: mergeNested(BASE_LAYOUT.margin, layout?.margin),
          xaxis: mergeAxis(layout?.xaxis),
          yaxis: mergeAxis(layout?.yaxis),
        };

        await Plotly.react(
          element,
          data as unknown as Data[],
          merged as unknown as Partial<Layout>,
          { ...BASE_CONFIG, ...config },
        );

        if (frames && frames.length > 0 && !cancelled) {
          await Plotly.addFrames(element, frames as unknown as Parameters<typeof Plotly.addFrames>[1]);
        }
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      loadPlotly().then((Plotly) => Plotly.purge(element));
    };
  }, [data, layout, config, frames, height]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-200 ${className}`}
        style={{ height }}
      >
        Chart failed to render: {failed}
      </div>
    );
  }

  const title = isRecord(layout?.title) ? layout.title.text : layout?.title;

  return (
    <div className={`relative ${className}`} style={{ minHeight: height }}>
      {!ready && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/[0.02] text-sm text-slate-400"
          style={{ height }}
        >
          Loading chart…
        </div>
      )}
      <div
        ref={container}
        role="img"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : "Chart")}
      />
    </div>
  );
}

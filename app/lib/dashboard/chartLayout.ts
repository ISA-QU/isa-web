/**
 * Chart layout at phone width (Fix pack 11). Applied by Chart.tsx only when the
 * chart itself is narrower than NARROW_CHART_PX, so desktop and tablet charts
 * are drawn exactly as before. Pure, so the verify script can check it.
 */

/** Below this chart width (px) the narrow layout applies. */
export const NARROW_CHART_PX = 640;

/** Fiscal-year axes tick every 5 years when narrow (FY1997–FY2025: ~6 labels, not 15). */
export const NARROW_FY_DTICK = 5;

/** Event label annotations carry this name, so a narrow chart can leave them hover-only. */
export const EVENT_LABEL_NAME = "event-label";

type Layout = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The narrow version of a merged chart layout:
 * - a numeric x-axis tick step under 5 (the fiscal-year charts' 2) becomes 5;
 * - event labels are dropped (the ◆ markers and their hover stay);
 * - a smaller title, and the legend below the plot, left-aligned, in a smaller font.
 */
export function narrowChartLayout(layout: Layout): Layout {
  const xaxis = isRecord(layout.xaxis) ? layout.xaxis : {};
  const dtick = xaxis.dtick;
  const title = isRecord(layout.title) ? layout.title : null;
  const titleFont = title && isRecord(title.font) ? title.font : {};
  const legend = isRecord(layout.legend) ? layout.legend : {};
  const legendFont = isRecord(legend.font) ? legend.font : {};
  const annotations = Array.isArray(layout.annotations) ? layout.annotations : null;
  return {
    ...layout,
    xaxis: typeof dtick === "number" && dtick < NARROW_FY_DTICK ? { ...xaxis, dtick: NARROW_FY_DTICK } : xaxis,
    ...(title ? { title: { ...title, font: { ...titleFont, size: 14 } } } : {}),
    legend: {
      ...legend,
      orientation: "h",
      x: 0,
      xanchor: "left",
      y: -0.25,
      yanchor: "top",
      font: { ...legendFont, size: 10 },
    },
    ...(annotations
      ? { annotations: annotations.filter((a) => !(isRecord(a) && a.name === EVENT_LABEL_NAME)) }
      : {}),
  };
}

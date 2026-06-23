import {
  isTicketSdrCanvas,
  resolveTicketCanvasDpr,
  resolveTicketCanvasPaintScale,
  resolveTicketSdrDisplayScale,
  type TicketCanvasQualityMode,
} from "@/lib/canvasSetup";
import { paintTicketFrame } from "@/lib/paintTicketFrame";
import type { TicketFrameLayers } from "@/lib/ticketFrameLayers";

/** Legacy = render scale. Enhanced = SDR chrome 8× HQ → text @ 2× display. */
export type CanvasQualityMode = TicketCanvasQualityMode;

export type CanvasQualityPaintOptions = {
  mode?: CanvasQualityMode;
};

export type CanvasQualityPaintResult = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  renderScale: number;
  mode: CanvasQualityMode;
  paintScale: number;
  displayScale: number;
};

/**
 * Paint a ticket-sized canvas using the stats-bar split layer pipeline.
 */
export function paintWithCanvasQuality(
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
  layers: TicketFrameLayers,
  options: CanvasQualityPaintOptions = {},
): CanvasQualityPaintResult | null {
  const mode = options.mode ?? "enhanced";
  const result = paintTicketFrame(canvas, logicalWidth, logicalHeight, layers, {
    mode,
  });
  if (!result) return null;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  return {
    ctx,
    dpr: result.dpr,
    renderScale: result.displayScale,
    mode: result.mode,
    paintScale: result.paintScale,
    displayScale: result.displayScale,
  };
}

export function describeCanvasQualityMode(mode: CanvasQualityMode): string {
  const dpr = resolveTicketCanvasDpr();
  const paintScale = resolveTicketCanvasPaintScale(dpr, mode);
  if (mode === "legacy") {
    return `legacy · paint ${paintScale.toFixed(2)}×`;
  }
  if (isTicketSdrCanvas(dpr)) {
    const displayScale = resolveTicketSdrDisplayScale(dpr);
    return `enhanced · SDR chrome ${paintScale.toFixed(0)}× HQ → text @ ${displayScale}×`;
  }
  return `enhanced · HiDPI ${paintScale.toFixed(0)}× direct`;
}

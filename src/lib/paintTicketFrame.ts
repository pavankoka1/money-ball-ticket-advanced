import {
  isTicketSdrCanvas,
  resolveTicketCanvasDpr,
  resolveTicketCanvasPaintScale,
  type TicketCanvasQualityMode,
} from "@/lib/canvasSetup";
import {
  blitHighQualityDownsample,
  ensureDownscalePingBuffers,
  ensureSharedPaintCanvas,
  getCached2dContext,
  syncTicketDisplayCanvas,
} from "@/lib/canvasContext";
import type { TicketFrameLayers } from "@/lib/ticketFrameLayers";

export type PaintTicketFrameResult = {
  dpr: number;
  paintScale: number;
  displayScale: number;
  mode: TicketCanvasQualityMode;
};

/**
 * Enhanced SDR (matches stats bars): chrome at 8× → HQ downsample → 2× display buffer,
 * then text painted natively at 2× on the display canvas (never downsampled).
 * HiDPI: chrome + text direct at chrome scale.
 */
export function paintTicketFrame(
  displayCanvas: HTMLCanvasElement | OffscreenCanvas,
  logicalWidth: number,
  logicalHeight: number,
  layers: TicketFrameLayers,
  options: { mode?: TicketCanvasQualityMode; domMatched?: boolean; dpr?: number } = {},
): PaintTicketFrameResult | null {
  const mode = options.mode ?? "enhanced";
  const domMatched = options.domMatched ?? false;
  const dpr = options.dpr ?? resolveTicketCanvasDpr();
  const paintScale = resolveTicketCanvasPaintScale(dpr, mode);
  const { bufferW, bufferH, displayScale } = syncTicketDisplayCanvas(
    displayCanvas,
    logicalWidth,
    logicalHeight,
    dpr,
    mode,
    paintScale,
  );

  const displayCtx = getCached2dContext(displayCanvas);
  if (!displayCtx) return null;

  if (mode === "enhanced" && isTicketSdrCanvas(dpr) && !domMatched) {
    const srcW = Math.max(1, Math.round(logicalWidth * paintScale));
    const srcH = Math.max(1, Math.round(logicalHeight * paintScale));
    ensureDownscalePingBuffers(srcW, srcH, bufferW, bufferH);
    const paintCanvas = ensureSharedPaintCanvas(srcW, srcH);
    const paintCtx = getCached2dContext(paintCanvas);
    if (!paintCtx) return null;

    paintCtx.setTransform(1, 0, 0, 1, 0, 0);
    paintCtx.clearRect(0, 0, srcW, srcH);
    paintCtx.setTransform(paintScale, 0, 0, paintScale, 0, 0);
    layers.paintChrome(paintCtx as CanvasRenderingContext2D, paintScale);

    blitHighQualityDownsample(displayCtx, paintCanvas, srcW, srcH, bufferW, bufferH);

    displayCtx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
    layers.paintText(displayCtx as CanvasRenderingContext2D, displayScale);
  } else {
    const layerScale = domMatched ? displayScale : paintScale;
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.clearRect(0, 0, bufferW, bufferH);
    displayCtx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
    layers.paintChrome(displayCtx as CanvasRenderingContext2D, layerScale);
    layers.paintText(displayCtx as CanvasRenderingContext2D, layerScale);
  }

  return { dpr, paintScale, displayScale, mode };
}

/**
 * Chrome-only pass (background + dividers). SDR: 8× HQ downsample → 2× buffer.
 * Used by the grid viewport — text is painted separately on the display canvas (stats pattern).
 */
export function paintTicketChromeFrame(
  displayCanvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
  layers: TicketFrameLayers,
  options: { mode?: TicketCanvasQualityMode } = {},
): PaintTicketFrameResult | null {
  const mode = options.mode ?? "enhanced";
  const dpr = resolveTicketCanvasDpr();
  const paintScale = resolveTicketCanvasPaintScale(dpr, mode);
  const { bufferW, bufferH, displayScale } = syncTicketDisplayCanvas(
    displayCanvas,
    logicalWidth,
    logicalHeight,
    dpr,
    mode,
    paintScale,
  );

  const displayCtx = getCached2dContext(displayCanvas);
  if (!displayCtx) return null;

  if (mode === "enhanced" && isTicketSdrCanvas(dpr)) {
    const srcW = Math.max(1, Math.round(logicalWidth * paintScale));
    const srcH = Math.max(1, Math.round(logicalHeight * paintScale));
    ensureDownscalePingBuffers(srcW, srcH, bufferW, bufferH);
    const paintCanvas = ensureSharedPaintCanvas(srcW, srcH);
    const paintCtx = getCached2dContext(paintCanvas);
    if (!paintCtx) return null;

    paintCtx.setTransform(1, 0, 0, 1, 0, 0);
    paintCtx.clearRect(0, 0, srcW, srcH);
    paintCtx.setTransform(paintScale, 0, 0, paintScale, 0, 0);
    layers.paintChrome(paintCtx as CanvasRenderingContext2D, paintScale);

    blitHighQualityDownsample(displayCtx, paintCanvas, srcW, srcH, bufferW, bufferH);
  } else {
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.clearRect(0, 0, bufferW, bufferH);
    displayCtx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
    layers.paintChrome(displayCtx as CanvasRenderingContext2D, paintScale);
  }

  return { dpr, paintScale, displayScale, mode };
}

/**
 * Text-only pass. SDR: paint at paintScale (8×) → HQ downsample → displayScale buffer.
 * Restores bold Onest strokes that were lost when baking text directly at displayScale.
 */
export function paintTicketTextFrame(
  displayCanvas: HTMLCanvasElement | OffscreenCanvas,
  logicalWidth: number,
  logicalHeight: number,
  layers: TicketFrameLayers,
  options: { mode?: TicketCanvasQualityMode; domMatched?: boolean; dpr?: number } = {},
): PaintTicketFrameResult | null {
  const mode = options.mode ?? "enhanced";
  const domMatched = options.domMatched ?? true;
  const dpr = options.dpr ?? resolveTicketCanvasDpr();
  const paintScale = resolveTicketCanvasPaintScale(dpr, mode);
  const { bufferW, bufferH, displayScale } = syncTicketDisplayCanvas(
    displayCanvas,
    logicalWidth,
    logicalHeight,
    dpr,
    mode,
    paintScale,
  );

  const displayCtx = getCached2dContext(displayCanvas);
  if (!displayCtx) return null;

  if (mode === "enhanced" && isTicketSdrCanvas(dpr) && paintScale > displayScale) {
    const srcW = Math.max(1, Math.round(logicalWidth * paintScale));
    const srcH = Math.max(1, Math.round(logicalHeight * paintScale));
    ensureDownscalePingBuffers(srcW, srcH, bufferW, bufferH);
    const paintCanvas = ensureSharedPaintCanvas(srcW, srcH);
    const paintCtx = getCached2dContext(paintCanvas);
    if (!paintCtx) return null;

    paintCtx.setTransform(1, 0, 0, 1, 0, 0);
    paintCtx.clearRect(0, 0, srcW, srcH);
    paintCtx.setTransform(paintScale, 0, 0, paintScale, 0, 0);
    layers.paintText(paintCtx as CanvasRenderingContext2D, paintScale);

    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.clearRect(0, 0, bufferW, bufferH);
    blitHighQualityDownsample(displayCtx, paintCanvas, srcW, srcH, bufferW, bufferH);
  } else {
    const layerScale = domMatched ? displayScale : paintScale;
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.clearRect(0, 0, bufferW, bufferH);
    displayCtx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
    layers.paintText(displayCtx as CanvasRenderingContext2D, layerScale);
  }

  return { dpr, paintScale, displayScale, mode };
}

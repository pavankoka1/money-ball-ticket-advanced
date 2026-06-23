import {
  isTicketSdrCanvas,
  resolveTicketDisplayBufferSize,
  type TicketCanvasQualityMode,
} from "@/lib/canvasSetup";
import { getCanvasSourceSize, isHtmlCanvas } from "@/lib/canvasSource";
import { resetTicketDisplayFontAtlases } from "@/lib/ticketDisplayAtlases";
import {
  resetGridTicketFontCache,
  resetTicketSpriteCache,
} from "@/lib/ticketRenderer";

type BufferCanvas = HTMLCanvasElement | OffscreenCanvas;

function createBufferCanvas(): BufferCanvas {
  if (typeof OffscreenCanvas !== "undefined" && typeof document === "undefined") {
    return new OffscreenCanvas(1, 1);
  }
  return document.createElement("canvas");
}

const canvas2dCache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

type Canvas2dContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export const getCached2dContext = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Canvas2dContext | null => {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.getContext("2d", { alpha: true, willReadFrequently: false });
  }
  const htmlCanvas = canvas as HTMLCanvasElement;
  const cached = canvas2dCache.get(htmlCanvas);
  if (cached) return cached;
  const ctx = htmlCanvas.getContext("2d", {
    alpha: true,
    willReadFrequently: false,
  });
  if (ctx) canvas2dCache.set(htmlCanvas, ctx);
  return ctx;
};

let sharedPaintCanvas: BufferCanvas | null = null;

export const ensureSharedPaintCanvas = (
  bufferW: number,
  bufferH: number,
): BufferCanvas => {
  if (!sharedPaintCanvas) sharedPaintCanvas = createBufferCanvas();
  if (sharedPaintCanvas.width !== bufferW) sharedPaintCanvas.width = bufferW;
  if (sharedPaintCanvas.height !== bufferH) sharedPaintCanvas.height = bufferH;
  return sharedPaintCanvas;
};

type DisplayCanvas = HTMLCanvasElement | OffscreenCanvas;

export const syncTicketDisplayCanvas = (
  canvas: DisplayCanvas,
  cssW: number,
  cssH: number,
  dpr: number,
  qualityMode: TicketCanvasQualityMode,
  paintScale: number,
): { bufferW: number; bufferH: number; displayScale: number } => {
  const { bufferW, bufferH, displayScale } = resolveTicketDisplayBufferSize(
    cssW,
    cssH,
    dpr,
    paintScale,
    qualityMode,
  );
  if (canvas.width !== bufferW) canvas.width = bufferW;
  if (canvas.height !== bufferH) canvas.height = bufferH;
  if (isHtmlCanvas(canvas)) {
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }
  return { bufferW, bufferH, displayScale };
};

let downscalePingA: BufferCanvas | null = null;
let downscalePingB: BufferCanvas | null = null;
let downscaleBufferKey = "";

export const ensureDownscalePingBuffers = (
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): void => {
  const key = `${srcW}x${srcH}->${dstW}x${dstH}`;
  if (downscaleBufferKey === key) return;

  downscalePingA = downscalePingA ?? createBufferCanvas();
  downscalePingB = downscalePingB ?? createBufferCanvas();

  let maxMidW = 0;
  let maxMidH = 0;
  let w = srcW;
  let h = srcH;
  while (w / dstW >= 2 && h / dstH >= 2) {
    w = Math.floor(w / 2);
    h = Math.floor(h / 2);
    maxMidW = Math.max(maxMidW, w);
    maxMidH = Math.max(maxMidH, h);
  }

  if (maxMidW > 0 && maxMidH > 0) {
    if (downscalePingA.width < maxMidW) downscalePingA.width = maxMidW;
    if (downscalePingA.height < maxMidH) downscalePingA.height = maxMidH;
    if (downscalePingB.width < maxMidW) downscalePingB.width = maxMidW;
    if (downscalePingB.height < maxMidH) downscalePingB.height = maxMidH;
  }

  downscaleBufferKey = key;
};

export const resetTicketRenderCaches = (): void => {
  downscaleBufferKey = "";
  resetTicketSpriteCache();
  resetTicketDisplayFontAtlases();
  resetGridTicketFontCache();
};

export const blitHighQualityDownsample = (
  displayCtx: Canvas2dContext,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): void => {
  displayCtx.setTransform(1, 0, 0, 1, 0, 0);
  displayCtx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in displayCtx) {
    displayCtx.imageSmoothingQuality = "high";
  }
  displayCtx.clearRect(0, 0, dstW, dstH);

  let current: CanvasImageSource = source;
  let w = srcW;
  let h = srcH;
  let ping = false;

  while (w / dstW >= 2 && h / dstH >= 2) {
    const midW = Math.floor(w / 2);
    const midH = Math.floor(h / 2);
    const midCanvas = ping
      ? (downscalePingA ?? (downscalePingA = createBufferCanvas()))
      : (downscalePingB ?? (downscalePingB = createBufferCanvas()));
    ping = !ping;

    if (midCanvas.width < midW) midCanvas.width = midW;
    if (midCanvas.height < midH) midCanvas.height = midH;

    const midCtx = getCached2dContext(midCanvas);
    if (!midCtx) break;
    midCtx.setTransform(1, 0, 0, 1, 0, 0);
    midCtx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in midCtx) {
      midCtx.imageSmoothingQuality = "high";
    }
    midCtx.clearRect(0, 0, midW, midH);
    midCtx.drawImage(current, 0, 0, w, h, 0, 0, midW, midH);

    current = midCanvas;
    w = midW;
    h = midH;
  }

  displayCtx.drawImage(current, 0, 0, w, h, 0, 0, dstW, dstH);
};

/**
 * Blit a ticket sprite into viewport logical coords. Nearest-neighbour 1:1 only —
 * mismatched sizes mean the sprite is stale (zoom); caller must repaint first.
 */
export const blitTicketSpriteToViewport = (
  ctx: Canvas2dContext,
  sprite: CanvasImageSource,
  x: number,
  y: number,
  logicalW: number,
  logicalH: number,
  displayScale: number,
): boolean => {
  const destBufferW = Math.max(1, Math.round(logicalW * displayScale));
  const destBufferH = Math.max(1, Math.round(logicalH * displayScale));
  const { width: spriteW, height: spriteH } = getCanvasSourceSize(
    sprite,
    destBufferW,
    destBufferH,
  );
  if (spriteW !== destBufferW || spriteH !== destBufferH) {
    return false;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0, spriteW, spriteH, x, y, logicalW, logicalH);
  ctx.restore();
  return true;
};

/** Blit a design-resolution sprite into a fluid column width (hybrid catalog). */
export const blitTicketSpriteScaled = (
  ctx: Canvas2dContext,
  sprite: CanvasImageSource,
  x: number,
  y: number,
  destLogicalW: number,
  destLogicalH: number,
): void => {
  const { width: spriteW, height: spriteH } = getCanvasSourceSize(sprite, 1, 1);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }
  ctx.drawImage(sprite, 0, 0, spriteW, spriteH, x, y, destLogicalW, destLogicalH);
  ctx.restore();
};

/** HQ downsample an 8× paint buffer onto a 2× display buffer (SDR enhanced path). */
export function blitTicketPaintToDisplay(
  displayCanvas: HTMLCanvasElement | OffscreenCanvas,
  paintSource: CanvasImageSource,
  logicalW: number,
  logicalH: number,
  dpr: number,
  paintScale: number,
  qualityMode: TicketCanvasQualityMode = "enhanced",
): number {
  const { bufferW, bufferH, displayScale } = resolveTicketDisplayBufferSize(
    logicalW,
    logicalH,
    dpr,
    paintScale,
    qualityMode,
  );

  if (isHtmlCanvas(displayCanvas)) {
    displayCanvas.style.width = `${logicalW}px`;
    displayCanvas.style.height = `${logicalH}px`;
  }
  if (displayCanvas.width !== bufferW) displayCanvas.width = bufferW;
  if (displayCanvas.height !== bufferH) displayCanvas.height = bufferH;

  const displayCtx = getCached2dContext(displayCanvas);
  if (!displayCtx) return displayScale;

  if (qualityMode === "enhanced" && isTicketSdrCanvas(dpr)) {
    const srcW = Math.max(1, Math.round(logicalW * paintScale));
    const srcH = Math.max(1, Math.round(logicalH * paintScale));
    ensureDownscalePingBuffers(srcW, srcH, bufferW, bufferH);
    blitHighQualityDownsample(displayCtx, paintSource, srcW, srcH, bufferW, bufferH);
    return displayScale;
  }

  displayCtx.setTransform(1, 0, 0, 1, 0, 0);
  displayCtx.clearRect(0, 0, bufferW, bufferH);
  displayCtx.drawImage(paintSource, 0, 0, bufferW, bufferH);
  return displayScale;
}

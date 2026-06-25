import { getDprOverride } from "@/lib/dprOverride";
import { getDisplayScaleOverride } from "@/lib/displayScaleOverride";
import { getPaintScaleOverride } from "@/lib/paintScaleOverride";

/** DPR for backing-store sizing. Reads the user-selected override (default 1). */
export const resolveTicketCanvasDpr = (): number => {
  if (typeof window === "undefined") return 1;
  return getDprOverride();
};

/** SDR floor — single backing-store scale on Linux/Windows (DPR=1). */
const MIN_SDR_RENDER_SCALE = 4;
const MIN_SDR_CHROME_SCALE = 8;

/** SDR display backing store floor (HQ downsample target at 1× browser zoom). */
export const TICKET_SDR_DISPLAY_SCALE = 2;

/** SDR display scale — grows with browser zoom up to the chrome paint cap. */
export const resolveTicketSdrDisplayScale = (
  _dpr = resolveTicketCanvasDpr(),
): number => {
  // Always explicit — override initialises to the natural value at screen DPR
  // and is reset whenever DPR changes via the dropdown.
  return getDisplayScaleOverride();
};

export type TicketCanvasQualityMode = "legacy" | "enhanced";

/**
 * Backing-store multiplier for legacy mode. The browser downscales the larger bitmap,
 * which softens gradient banding and text stair-steps without CSS upscaling blur.
 */
export const resolveTicketCanvasRenderScale = (
  dpr = resolveTicketCanvasDpr()
): number => {
  let scale = dpr;
  if (dpr >= 2) scale = dpr * 3;
  else if (dpr > 1) scale = dpr * 2;
  if (dpr < 2) scale = Math.max(scale, MIN_SDR_RENDER_SCALE);
  return scale;
};

/** Paint scale for enhanced mode — buffer matches this so the browser downscales once. */
export const resolveTicketChromeRenderScale = (
  dpr = resolveTicketCanvasDpr()
): number => {
  if (dpr >= 2) return dpr * 4;
  return Math.max(dpr * 2, MIN_SDR_CHROME_SCALE);
};

export const resolveTicketCanvasPaintScale = (
  _dpr = resolveTicketCanvasDpr(),
  _mode: TicketCanvasQualityMode = "enhanced"
): number => {
  // Always explicit — same lifecycle as displayScaleOverride.
  return getPaintScaleOverride();
};

/** Linux/Windows @ 1× DPR — huge backing store downscaled by the browser blurs chrome. */
export const isTicketSdrCanvas = (dpr = resolveTicketCanvasDpr()): boolean =>
  dpr < 2;

export const resolveTicketDisplayBufferSize = (
  cssW: number,
  cssH: number,
  dpr: number,
  paintScale: number,
  qualityMode: TicketCanvasQualityMode = "enhanced"
): { bufferW: number; bufferH: number; displayScale: number } => {
  if (qualityMode === "enhanced" && isTicketSdrCanvas(dpr)) {
    const displayScale = resolveTicketSdrDisplayScale(dpr);
    return {
      bufferW: Math.max(1, Math.round(cssW * displayScale)),
      bufferH: Math.max(1, Math.round(cssH * displayScale)),
      displayScale,
    };
  }
  const scale =
    qualityMode === "enhanced" ? paintScale : resolveTicketCanvasRenderScale(dpr);
  return {
    bufferW: Math.max(1, Math.round(cssW * scale)),
    bufferH: Math.max(1, Math.round(cssH * scale)),
    displayScale: scale,
  };
};

export const watchTicketCanvasDpr = (onChange: () => void): (() => void) => {
  if (typeof window === "undefined") return () => undefined;

  let dpr = resolveTicketCanvasDpr();
  let media = window.matchMedia(`(resolution: ${dpr}dppx)`);

  const syncMediaQuery = (): void => {
    media.removeEventListener("change", onMediaChange);
    dpr = resolveTicketCanvasDpr();
    media = window.matchMedia(`(resolution: ${dpr}dppx)`);
    media.addEventListener("change", onMediaChange);
  };

  const onMediaChange = (): void => {
    onChange();
    syncMediaQuery();
  };

  media.addEventListener("change", onMediaChange);

  const onWindowResize = (): void => {
    const next = resolveTicketCanvasDpr();
    if (Math.abs(next - dpr) < 0.001) return;
    onChange();
    syncMediaQuery();
  };

  window.addEventListener("resize", onWindowResize);
  window.visualViewport?.addEventListener("resize", onWindowResize);
  window.visualViewport?.addEventListener("scroll", onWindowResize);

  return () => {
    media.removeEventListener("change", onMediaChange);
    window.removeEventListener("resize", onWindowResize);
    window.visualViewport?.removeEventListener("resize", onWindowResize);
    window.visualViewport?.removeEventListener("scroll", onWindowResize);
  };
};

/** Align a logical canvas unit to the physical pixel grid. */
export const snapToDevicePixel = (value: number, renderScale: number): number =>
  Math.round(value * renderScale) / renderScale;

/** Half-logical-pixel grid — sharper text and smoother curves than integer snapping. */
export const snapToHalfLogicalPixel = (value: number, renderScale: number): number =>
  Math.round(value * renderScale * 2) / (renderScale * 2);

type Canvas2dLike =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/** Round joins/caps soften stroked curves after downsampling (when borders are used). */
export const applyCanvasLineQuality = (ctx: Canvas2dLike): void => {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
};

export const applyCanvasPaintQuality = (ctx: Canvas2dLike): void => {
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }

  const ctxWithRendering = ctx as CanvasRenderingContext2D & {
    textRendering?: CanvasTextRendering;
  };
  if ("textRendering" in ctxWithRendering) {
    ctxWithRendering.textRendering = "geometricPrecision";
  }
};

export type TicketCanvasSetup = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  /** Active paint / backing-store scale used for snapping. */
  renderScale: number;
};

/**
 * Fixed scale for experimental SDF glyph atlases (e.g. stat-bar lab).
 * Ticket text uses {@link resolveTicketChromeRenderScale} instead — same as Canvas 2D enhanced.
 */
export const SDF_ATLAS_GENERATION_SCALE = 4;

export type SetupHighQualityCanvasOptions = {
  dpr?: number;
  mode?: TicketCanvasQualityMode;
};

export function setupHighQualityCanvas(
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
  options: SetupHighQualityCanvasOptions = {}
): TicketCanvasSetup | null {
  const dpr = options.dpr ?? resolveTicketCanvasDpr();
  const mode = options.mode ?? "enhanced";
  const paintScale = resolveTicketCanvasPaintScale(dpr, mode);
  const physicalWidth = Math.max(1, Math.round(logicalWidth * paintScale));
  const physicalHeight = Math.max(1, Math.round(logicalHeight * paintScale));

  if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
  }
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, physicalWidth, physicalHeight);
  ctx.setTransform(paintScale, 0, 0, paintScale, 0, 0);
  applyCanvasPaintQuality(ctx);
  applyCanvasLineQuality(ctx);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  return { ctx, dpr, renderScale: paintScale };
}

let ticketFontsReady: Promise<void> | null = null;

/** Canvas text uses font metrics immediately; wait for Onest before the first paint. */
export const ensureTicketFontsReady = (
  bodyFont: string,
  idFont: string
): Promise<void> => {
  if (ticketFontsReady) return ticketFontsReady;

  if (typeof document === "undefined" || !document.fonts?.load) {
    ticketFontsReady = Promise.resolve();
    return ticketFontsReady;
  }

  ticketFontsReady = Promise.all([
    document.fonts.load(bodyFont),
    document.fonts.load(idFont),
  ]).then(
    () => undefined,
    () => undefined
  );

  return ticketFontsReady;
};

import {
  applyCanvasLineQuality,
  applyCanvasPaintQuality,
  snapToDevicePixel,
  snapToHalfLogicalPixel,
} from "@/lib/canvasSetup";
import type { CanvasQualityMode } from "@/lib/canvasQuality";
import {
  getTicketDisplayFontAtlases,
  type TicketDisplayFontAtlases,
} from "@/lib/ticketDisplayAtlases";
import {
  drawBitmapTextOnDisplay,
  measureTextWidth,
  type FontAtlas,
} from "@/lib/renderers/fontAtlas";
import { traceRoundedRect, traceVerticalCapsule } from "@/lib/roundedRectPath";
import {
  REFERENCE_TICKET,
  TICKET_COLORS,
  TICKET_DESIGN_HEIGHT,
  TICKET_DESIGN_WIDTH,
  TICKET_HEADER_HEIGHT,
  TICKET_ID_CENTER_Y,
  TICKET_ID_RIGHT_X,
  TICKET_ID_TEXT,
  TICKET_NUMBERS_BAND_HEIGHT,
  TICKET_RADIUS,
  TICKET_SEPARATOR_COLOR,
  TICKET_SEPARATOR_HEIGHT,
  TICKET_SEPARATOR_RADIUS,
  TICKET_SEPARATOR_WIDTH,
  TICKET_TEXT,
  createTicketNumbersBandGradient,
  ticketBodyFont,
  ticketBodyMetrics,
  ticketCellCenterX,
  ticketDomCellTextCenterY,
  ticketIdFont,
  ticketNumbersBandTop,
  ticketSeparatorX,
} from "@/lib/ticketDesign";
import { visualCenterToBaselineY, measureTicketBodyTextPlacement, resolveDomMatchedMiddleAnchorY } from "@/lib/ticketTextMetrics";

export type TicketCanvas2DDrawOptions = {
  quality?: CanvasQualityMode;
};

/** Text baselines use half-pixel grid at paint scale for sharp single-pass rendering. */
function snapTextBaseline(
  value: number,
  renderScale: number,
  _quality: CanvasQualityMode
): number {
  return snapToHalfLogicalPixel(value, renderScale);
}

export function getTicketLayout(height = TICKET_DESIGN_HEIGHT) {
  const values = REFERENCE_TICKET.values;
  const body = ticketBodyMetrics(height);

  const cellCenterX = values.map((_, index) => ticketCellCenterX(index));
  const separatorX = values.slice(0, -1).map((_, index) => ticketSeparatorX(index));

  return {
    values,
    cellCenterX,
    separatorX,
    textY: body.textVisualCenterY,
    separatorY: body.separatorY,
    bodyY: body.bodyY,
    bodyH: body.bodyH,
    cellAreaTop: body.cellAreaTop,
  };
}

function drawSeparator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  renderScale: number
) {
  const drawX = snapToDevicePixel(x, renderScale);
  const drawY = snapToDevicePixel(y, renderScale);
  const w = TICKET_SEPARATOR_WIDTH;
  const h = TICKET_SEPARATOR_HEIGHT;

  ctx.fillStyle = TICKET_SEPARATOR_COLOR;
  traceVerticalCapsule(ctx, drawX, drawY, w, h, TICKET_SEPARATOR_RADIUS);
  ctx.fill();
}

export function drawReferenceTicketBackground(
  ctx: CanvasRenderingContext2D,
  width = TICKET_DESIGN_WIDTH,
  height = TICKET_DESIGN_HEIGHT
) {
  const numbersBandTop = ticketNumbersBandTop(height);
  const numbersBandHeight = TICKET_NUMBERS_BAND_HEIGHT;

  // Matches DomTicketCard: cream header + gradient body band (no extra white layer).
  ctx.save();
  traceRoundedRect(ctx, 0, 0, width, height, TICKET_RADIUS);
  ctx.clip();

  ctx.fillStyle = TICKET_COLORS.white;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = TICKET_COLORS.cream;
  ctx.fillRect(0, 0, width, TICKET_HEADER_HEIGHT);

  ctx.fillStyle = createTicketNumbersBandGradient(
    ctx,
    numbersBandTop,
    numbersBandHeight
  );
  ctx.fillRect(0, numbersBandTop, width, numbersBandHeight);

  ctx.restore();
}

export function drawReferenceTicketDividersCanvas2D(
  ctx: CanvasRenderingContext2D,
  renderScale = 1,
  height = TICKET_DESIGN_HEIGHT
) {
  const { separatorX, separatorY } = getTicketLayout(height);

  separatorX.forEach((x) => drawSeparator(ctx, x, separatorY, renderScale));
}

/** Header id: right @ width−4px, vertically centred in header (fixed reference chrome). */
function drawTicketId(
  ctx: CanvasRenderingContext2D,
  idFont: string,
  renderScale: number,
  quality: CanvasQualityMode,
  ticketId: number = REFERENCE_TICKET.id,
  displayAtlas?: FontAtlas | null,
  originBufferX = 0,
  originBufferY = 0,
  domMatchedText = false,
): void {
  const text = String(ticketId);

  ctx.font = idFont;

  if (domMatchedText) {
    const metrics = ctx.measureText(text);
    const anchorY = resolveDomMatchedMiddleAnchorY(
      metrics,
      TICKET_ID_CENTER_Y,
      TICKET_ID_TEXT.size,
    );
    ctx.fillStyle = TICKET_ID_TEXT.color;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(text, TICKET_ID_RIGHT_X, anchorY);
    return;
  }

  const metrics = ctx.measureText(text);
  const baselineY = visualCenterToBaselineY(
    metrics,
    TICKET_ID_CENTER_Y,
    TICKET_ID_TEXT.size
  );
  const snappedBaseline = snapTextBaseline(baselineY, renderScale, quality);

  if (displayAtlas) {
    const leftX = TICKET_ID_RIGHT_X - measureTextWidth(displayAtlas, text);
    drawBitmapTextOnDisplay(
      ctx,
      displayAtlas,
      text,
      leftX,
      snappedBaseline,
      TICKET_ID_TEXT.color,
      renderScale,
      originBufferX,
      originBufferY,
    );
    return;
  }

  const snapPixel = (value: number): number =>
    snapToDevicePixel(value, renderScale);

  ctx.fillStyle = TICKET_ID_TEXT.color;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, snapPixel(TICKET_ID_RIGHT_X), snappedBaseline);
}

function drawTicketBodyValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  cellIndex: number,
  bodyFont: string,
  renderScale: number,
  quality: CanvasQualityMode,
  displayAtlas?: FontAtlas | null,
  originBufferX = 0,
  originBufferY = 0,
  domMatchedText = false,
): void {
  if (domMatchedText) {
    ctx.font = bodyFont;
    const metrics = ctx.measureText(text);
    const anchorY = resolveDomMatchedMiddleAnchorY(
      metrics,
      ticketDomCellTextCenterY(),
      TICKET_TEXT.size,
    );
    ctx.fillStyle = TICKET_TEXT.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, ticketCellCenterX(cellIndex), anchorY);
    return;
  }

  const { leftX, baselineY } = measureTicketBodyTextPlacement(
    ctx,
    text,
    cellIndex,
    bodyFont
  );
  const snappedBaseline = snapTextBaseline(baselineY, renderScale, quality);

  if (displayAtlas) {
    drawBitmapTextOnDisplay(
      ctx,
      displayAtlas,
      text,
      leftX,
      snappedBaseline,
      TICKET_TEXT.color,
      renderScale,
      originBufferX,
      originBufferY,
    );
    return;
  }

  ctx.font = bodyFont;
  ctx.fillStyle = TICKET_TEXT.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, leftX, snappedBaseline);
}

export type TicketTextLayerOptions = {
  bodyFont: string;
  idFont: string;
  ticketId?: number;
  renderScale: number;
  quality: CanvasQualityMode;
  displayAtlases?: TicketDisplayFontAtlases | { body: FontAtlas; id: FontAtlas };
  /** Native fillText — pixel-match DomTicketCard / Figma layout. */
  domMatchedText?: boolean;
};

function resolveBitmapDisplayAtlases(
  renderScale: number,
  quality: CanvasQualityMode,
  displayAtlases?: TicketTextLayerOptions["displayAtlases"],
  domMatchedText?: boolean,
): TicketDisplayFontAtlases | { body: FontAtlas; id: FontAtlas } | null {
  if (domMatchedText) return null;
  if (quality !== "enhanced") return null;

  if (displayAtlases?.body && displayAtlases.id) {
    return displayAtlases;
  }

  const bundle = getTicketDisplayFontAtlases();
  if (!bundle?.body.tintedByColor || !bundle?.id.tintedByColor) return null;
  if (bundle.scale !== renderScale) return null;
  return bundle;
}

/** Header id + body numbers — painted at `renderScale` without chrome shapes. */
export function drawTicketTextLayer(
  ctx: CanvasRenderingContext2D,
  values: number[],
  options: TicketTextLayerOptions,
): void {
  const { bodyFont, idFont, renderScale, quality, displayAtlases, domMatchedText } =
    options;
  const ticketId = options.ticketId ?? REFERENCE_TICKET.id;
  const bitmapAtlases = resolveBitmapDisplayAtlases(
    renderScale,
    quality,
    displayAtlases,
    domMatchedText,
  );

  if (bitmapAtlases) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = bodyFont;
    drawTicketId(
      ctx,
      idFont,
      renderScale,
      quality,
      ticketId,
      bitmapAtlases.id,
      0,
      0,
      domMatchedText,
    );
    values.forEach((value, index) => {
      drawTicketBodyValue(
        ctx,
        String(value),
        index,
        bodyFont,
        renderScale,
        quality,
        bitmapAtlases.body,
        0,
        0,
        domMatchedText,
      );
    });
    ctx.restore();
    return;
  }

  ctx.font = bodyFont;
  drawTicketId(ctx, idFont, renderScale, quality, ticketId, null, 0, 0, domMatchedText);

  values.forEach((value, index) => {
    drawTicketBodyValue(
      ctx,
      String(value),
      index,
      bodyFont,
      renderScale,
      quality,
      null,
      0,
      0,
      domMatchedText,
    );
  });
}

/**
 * Paint ticket text directly on a viewport/display canvas (stats `drawLabelsOnDisplay` pattern).
 * Chrome must already be on the canvas; text is never downsampled with chrome.
 */
export function drawTicketTextOnDisplay(
  displayCtx: CanvasRenderingContext2D,
  values: number[],
  originX: number,
  originY: number,
  viewportDisplayScale: number,
  options: TicketTextLayerOptions,
): void {
  const {
    bodyFont,
    idFont,
    renderScale,
    quality,
    displayAtlases,
  } = options;
  const ticketId = options.ticketId ?? REFERENCE_TICKET.id;
  const domMatchedText = options.domMatchedText ?? false;
  const bitmapAtlases = resolveBitmapDisplayAtlases(
    renderScale,
    quality,
    displayAtlases,
    options.domMatchedText,
  );

  const originBufferX = Math.round(originX * viewportDisplayScale);
  const originBufferY = Math.round(originY * viewportDisplayScale);

  if (bitmapAtlases) {
    displayCtx.save();
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.font = bodyFont;
    drawTicketId(
      displayCtx,
      idFont,
      renderScale,
      quality,
      ticketId,
      bitmapAtlases.id,
      originBufferX,
      originBufferY,
      domMatchedText,
    );
    values.forEach((value, index) => {
      drawTicketBodyValue(
        displayCtx,
        String(value),
        index,
        bodyFont,
        renderScale,
        quality,
        bitmapAtlases.body,
        originBufferX,
        originBufferY,
        domMatchedText,
      );
    });
    displayCtx.restore();
    return;
  }

  displayCtx.save();
  displayCtx.setTransform(
    renderScale,
    0,
    0,
    renderScale,
    originBufferX,
    originBufferY,
  );
  displayCtx.font = bodyFont;
  drawTicketId(
    displayCtx,
    idFont,
    renderScale,
    quality,
    ticketId,
    null,
    0,
    0,
    domMatchedText,
  );
  values.forEach((value, index) => {
    drawTicketBodyValue(
      displayCtx,
      String(value),
      index,
      bodyFont,
      renderScale,
      quality,
      null,
      0,
      0,
      domMatchedText,
    );
  });
  displayCtx.restore();
}

/** Chrome only: background, dividers, header id — no body numbers. */
export function drawReferenceTicketChrome(
  ctx: CanvasRenderingContext2D,
  width = TICKET_DESIGN_WIDTH,
  height = TICKET_DESIGN_HEIGHT,
  idFont?: string,
  renderScale = 1,
  options: TicketCanvas2DDrawOptions = {}
) {
  const quality = options.quality ?? "enhanced";
  applyCanvasPaintQuality(ctx);
  applyCanvasLineQuality(ctx);

  drawReferenceTicketBackground(ctx, width, height);
  drawReferenceTicketDividersCanvas2D(ctx, renderScale, height);
  drawTicketId(ctx, idFont ?? ticketIdFont(), renderScale, quality);
}

/** Shapes only — background + dividers, no text (for SDR chrome HQ pass). */
export function drawReferenceTicketShapes(
  ctx: CanvasRenderingContext2D,
  width = TICKET_DESIGN_WIDTH,
  height = TICKET_DESIGN_HEIGHT,
  renderScale = 1,
) {
  applyCanvasPaintQuality(ctx);
  applyCanvasLineQuality(ctx);
  drawReferenceTicketBackground(ctx, width, height);
  drawReferenceTicketDividersCanvas2D(ctx, renderScale, height);
}

/**
 * Full ticket — same chrome as /ticket; only `values` (6 body numbers) may differ.
 */
export function drawTicketCanvas2D(
  ctx: CanvasRenderingContext2D,
  values: number[],
  width = TICKET_DESIGN_WIDTH,
  height = TICKET_DESIGN_HEIGHT,
  fonts?: { body?: string; id?: string },
  renderScale = 1,
  options: TicketCanvas2DDrawOptions = {}
) {
  const quality = options.quality ?? "enhanced";
  const bodyFont = fonts?.body ?? ticketBodyFont();

  drawReferenceTicketShapes(ctx, width, height, renderScale);
  drawTicketTextLayer(ctx, values, {
    bodyFont,
    idFont: fonts?.id ?? ticketIdFont(),
    renderScale,
    quality,
  });
}

export function drawReferenceTicketCanvas2D(
  ctx: CanvasRenderingContext2D,
  width = TICKET_DESIGN_WIDTH,
  height = TICKET_DESIGN_HEIGHT,
  fonts?: { body?: string; id?: string },
  renderScale = 1,
  options: TicketCanvas2DDrawOptions = {}
) {
  drawTicketCanvas2D(
    ctx,
    [...REFERENCE_TICKET.values],
    width,
    height,
    fonts,
    renderScale,
    options
  );
}

export function createReferenceTicketChromeImage(
  width = TICKET_DESIGN_WIDTH,
  height = TICKET_DESIGN_HEIGHT,
  renderScale = 1,
  idFont?: string,
  options: TicketCanvas2DDrawOptions = {}
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(width * renderScale);
  canvas.height = Math.floor(height * renderScale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  drawReferenceTicketChrome(ctx, width, height, idFont, renderScale, options);
  return canvas;
}

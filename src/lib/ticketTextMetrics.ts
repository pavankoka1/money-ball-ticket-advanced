import {
  ticketBodyTextAnchorX,
  ticketDomCellTextCenterY,
  TICKET_TEXT,
} from "@/lib/ticketDesign";

/** Map a target visual ink centre Y to an alphabetic baseline (Canvas has no line-height). */
export function visualCenterToBaselineY(
  metrics: TextMetrics,
  visualCenterY: number,
  fontSizeFallback: number
): number {
  const ascent =
    metrics.actualBoundingBoxAscent ??
    metrics.fontBoundingBoxAscent ??
    fontSizeFallback * 0.8;
  const descent =
    metrics.actualBoundingBoxDescent ??
    metrics.fontBoundingBoxDescent ??
    fontSizeFallback * 0.25;

  return visualCenterY + (ascent - descent) / 2;
}

/**
 * Canvas `textBaseline: middle` aligns the em box; CSS flex + line-height:1 centres
 * the line box. Full (1.0) overshoots; 0.7 sits ~0.15px low — settle feels like
 * a tiny upward jump.
 */
export const DOM_MATCHED_LINE_BOX_BLEND = 0.7;

/** Fine-tune canvas ink vs DOM (negative = shift canvas text up on screen). */
export const DOM_MATCHED_TEXT_Y_NUDGE = -0.25;

export function resolveDomMatchedMiddleAnchorY(
  metrics: TextMetrics,
  lineBoxCenterY: number,
  fontSize: number,
): number {
  const ascent =
    metrics.actualBoundingBoxAscent ??
    metrics.fontBoundingBoxAscent ??
    fontSize * 0.8;
  const descent =
    metrics.actualBoundingBoxDescent ??
    metrics.fontBoundingBoxDescent ??
    fontSize * 0.25;
  const inkHeight = ascent + descent;
  const lineBoxToInkOffset =
    (DOM_MATCHED_LINE_BOX_BLEND * (fontSize - inkHeight)) / 2;
  const nudge = DOM_MATCHED_TEXT_Y_NUDGE * (fontSize / TICKET_TEXT.size);
  return lineBoxCenterY + lineBoxToInkOffset + nudge;
}

export type TicketBodyTextPlacement = {
  leftX: number;
  baselineY: number;
};

/** Shared Canvas 2D + WebGL body-number placement (SVG text-anchor middle). */
export function measureTicketBodyTextPlacement(
  ctx: CanvasRenderingContext2D,
  text: string,
  cellIndex: number,
  bodyFont: string
): TicketBodyTextPlacement {
  const anchorX = ticketBodyTextAnchorX(cellIndex);
  const textVisualCenterY = ticketDomCellTextCenterY();

  ctx.font = bodyFont;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(text);
  const baselineY = visualCenterToBaselineY(
    metrics,
    textVisualCenterY,
    TICKET_TEXT.size
  );

  const inkLeft = metrics.actualBoundingBoxLeft;
  const inkRight = metrics.actualBoundingBoxRight;
  const inkMid =
    inkLeft !== undefined && inkRight !== undefined
      ? (inkLeft + inkRight) / 2
      : metrics.width / 2;

  return {
    leftX: anchorX - inkMid,
    baselineY,
  };
}

export function readFontExtents(
  metrics: TextMetrics,
  fontSizeFallback: number
): { ascent: number; descent: number } {
  return {
    ascent:
      metrics.actualBoundingBoxAscent ??
      metrics.fontBoundingBoxAscent ??
      fontSizeFallback * 0.8,
    descent:
      metrics.actualBoundingBoxDescent ??
      metrics.fontBoundingBoxDescent ??
      fontSizeFallback * 0.25,
  };
}

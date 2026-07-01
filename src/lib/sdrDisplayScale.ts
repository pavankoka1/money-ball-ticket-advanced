import {
  resolveTicketCanvasDpr,
  resolveTicketCanvasPaintScale,
  resolveTicketDisplayBufferSize,
} from "@/lib/canvasSetup";
import { resolveMemoryBudgetedCompositorScale } from "@/lib/deviceMemoryBudget";
import { TICKET_DESIGN_HEIGHT, TICKET_DESIGN_WIDTH } from "@/lib/ticketDesign";

const SDR_CANVAS_QUALITY = "enhanced" as const;

/** Measured hybrid grid drawable width — drives memory-budgeted compositor scale. */
let layoutCssWidth = 0;

export function setSdrLayoutCssWidth(cssWidth: number): void {
  layoutCssWidth = cssWidth > 0 ? cssWidth : 0;
}

export function getSdrLayoutCssWidth(): number {
  return layoutCssWidth;
}

export function getSdrNaturalDisplayScale(dpr = resolveTicketCanvasDpr()): number {
  const paintScale = resolveTicketCanvasPaintScale(dpr, SDR_CANVAS_QUALITY);
  const { displayScale } = resolveTicketDisplayBufferSize(
    TICKET_DESIGN_WIDTH,
    TICKET_DESIGN_HEIGHT,
    dpr,
    paintScale,
    SDR_CANVAS_QUALITY,
  );
  return displayScale;
}

export function getSdrDisplayScale(dpr = resolveTicketCanvasDpr()): number {
  const natural = getSdrNaturalDisplayScale(dpr);
  if (layoutCssWidth <= 0) return natural;
  return resolveMemoryBudgetedCompositorScale(natural, layoutCssWidth);
}

/** Compositor scale for tall-canvas tiles — memory-capped on constrained devices. */
export function getSdrCompositorScale(): number {
  return getSdrDisplayScale();
}

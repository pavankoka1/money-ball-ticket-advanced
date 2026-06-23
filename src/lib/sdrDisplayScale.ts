import {
  resolveTicketCanvasDpr,
  resolveTicketCanvasPaintScale,
  resolveTicketDisplayBufferSize,
} from "@/lib/canvasSetup";
import { TICKET_DESIGN_HEIGHT, TICKET_DESIGN_WIDTH } from "@/lib/ticketDesign";

const SDR_CANVAS_QUALITY = "enhanced" as const;

export function getSdrDisplayScale(dpr = resolveTicketCanvasDpr()): number {
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

/** Compositor scale for tall-canvas tiles — full SDR, never adaptive downscale. */
export function getSdrCompositorScale(): number {
  return getSdrDisplayScale();
}

import type { CanvasQualityMode } from "@/lib/canvasQuality";
import {
  applyCanvasLineQuality,
  applyCanvasPaintQuality,
} from "@/lib/canvasSetup";
import {
  drawReferenceTicketBackground,
  drawReferenceTicketDividersCanvas2D,
  drawTicketTextLayer,
} from "@/lib/renderers/drawReferenceTicket";
import { TICKET_DESIGN_HEIGHT, TICKET_DESIGN_WIDTH, ticketBodyFont, ticketIdFont } from "@/lib/ticketDesign";
import type { FontAtlas } from "@/lib/renderers/fontAtlas";

export type TicketFrameLayers = {
  /** Background + dividers only — no text (SDR: painted at chrome scale, then HQ downsampled). */
  paintChrome: (ctx: CanvasRenderingContext2D, scale: number) => void;
  /** Header id + body numbers (SDR: painted natively at display scale on top). */
  paintText: (ctx: CanvasRenderingContext2D, scale: number) => void;
};

export type CreateTicketFrameLayersOptions = {
  quality?: CanvasQualityMode;
  ticketId?: number;
  width?: number;
  height?: number;
  fonts?: { body?: string; id?: string };
  displayAtlases?: { body: FontAtlas; id: FontAtlas };
  /** Native fillText — pixel-match DomTicketCard / Figma layout. */
  domMatchedText?: boolean;
};

export function createTicketFrameLayers(
  values: number[],
  options: CreateTicketFrameLayersOptions = {},
): TicketFrameLayers {
  const quality = options.quality ?? "enhanced";
  const width = options.width ?? TICKET_DESIGN_WIDTH;
  const height = options.height ?? TICKET_DESIGN_HEIGHT;
  const bodyFont = options.fonts?.body ?? ticketBodyFont();
  const idFont = options.fonts?.id ?? ticketIdFont();
  const ticketId = options.ticketId;

  return {
    paintChrome: (ctx, scale) => {
      applyCanvasPaintQuality(ctx);
      applyCanvasLineQuality(ctx);
      drawReferenceTicketBackground(ctx, width, height);
      drawReferenceTicketDividersCanvas2D(ctx, scale, height, width);
    },
    paintText: (ctx, scale) => {
      applyCanvasPaintQuality(ctx);
      applyCanvasLineQuality(ctx);
      drawTicketTextLayer(ctx, values, {
        bodyFont,
        idFont,
        ticketId,
        renderScale: scale,
        quality,
        displayAtlases: options.displayAtlases,
        domMatchedText: options.domMatchedText,
        ticketWidth: width,
      });
    },
  };
}

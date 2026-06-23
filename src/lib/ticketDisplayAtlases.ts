import {
  attachTintedGlyphCache,
  buildBitmapFontAtlas,
  type FontAtlas,
} from "@/lib/renderers/fontAtlas";
import { getSdrDisplayScale } from "@/lib/sdrDisplayScale";
import { TICKET_ID_TEXT, TICKET_TEXT } from "@/lib/ticketDesign";
import {
  resolveTicketBodyFontSpec,
  resolveTicketIdFontSpec,
} from "@/lib/ticketFonts";

export type TicketDisplayFontAtlases = {
  body: FontAtlas;
  id: FontAtlas;
  scale: number;
};

let cache: TicketDisplayFontAtlases | null = null;
let cachePromise: Promise<TicketDisplayFontAtlases | null> | null = null;

export function getTicketDisplayFontAtlases(): TicketDisplayFontAtlases | null {
  const scale = getSdrDisplayScale();
  if (cache?.scale === scale) return cache;
  return null;
}

/**
 * Bitmap glyphs at the current enhanced display scale (SDR 2× or HiDPI paint scale).
 * Required for worker sprite baking on all DPRs — not gated on isTicketSdrCanvas.
 */
export async function ensureTicketDisplayFontAtlases(): Promise<TicketDisplayFontAtlases | null> {
  const scale = getSdrDisplayScale();
  if (cache?.scale === scale) return cache;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    if (typeof document !== "undefined") {
      await document.fonts.ready;
    }

    const bodyFont = resolveTicketBodyFontSpec();
    const idFont = resolveTicketIdFontSpec();

    const [body, id] = await Promise.all([
      buildBitmapFontAtlas({
        font: bodyFont,
        fontSize: TICKET_TEXT.size,
        charset: "0123456789",
        scale,
      }),
      buildBitmapFontAtlas({
        font: idFont,
        fontSize: TICKET_ID_TEXT.size,
        charset: "0123456789",
        scale,
      }),
    ]);

    attachTintedGlyphCache(body, [TICKET_TEXT.color]);
    attachTintedGlyphCache(id, [TICKET_ID_TEXT.color]);

    cache = { body, id, scale };
    return cache;
  })();

  return cachePromise;
}

export function resetTicketDisplayFontAtlases(): void {
  cache = null;
  cachePromise = null;
}

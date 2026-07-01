import type { CanvasQualityMode } from "@/lib/canvasQuality";
import { paintWithCanvasQuality } from "@/lib/canvasQuality";
import {
  ensureTicketFontsReady,
  resolveTicketCanvasDpr,
  resolveTicketCanvasPaintScale,
  resolveTicketDisplayBufferSize,
} from "@/lib/canvasSetup";
import { blitTicketSpriteToViewport } from "@/lib/canvasContext";
import { isConstrainedDevice } from "@/lib/deviceMemoryBudget";
import { isMobileTicketLayout } from "@/lib/ticketGridLayout";
import { drawTicketCanvas2D } from "@/lib/renderers/drawReferenceTicket";
import { paintTicketFrame } from "@/lib/paintTicketFrame";
import { createTicketFrameLayers } from "@/lib/ticketFrameLayers";
import {
  ensureTicketDisplayFontAtlases,
  getTicketDisplayFontAtlases,
} from "@/lib/ticketDisplayAtlases";
import {
  TICKET_DESIGN_HEIGHT,
  TICKET_DESIGN_WIDTH,
} from "@/lib/ticketDesign";
import {
  resolveTicketBodyFontSpec,
  resolveTicketIdFontSpec,
} from "@/lib/ticketFonts";
import type { Ticket } from "@/types/ticket";
import { TICKET_HEIGHT } from "@/types/ticket";

const GRID_CANVAS_QUALITY: CanvasQualityMode = "enhanced";

/** Body numbers only — chrome matches /ticket reference (fixed header id, etc.). */
export function ticketBodyValues(ticket: Ticket): number[] {
  return ticket.cells.map((cell) => cell.value);
}

export function getTicketFingerprint(ticket: Ticket): string {
  return `${ticket.id}:${ticketBodyValues(ticket).join(",")}`;
}

/** DPR + paint/display scale — invalidate caches when this changes (browser zoom). */
export function getTicketRenderKey(): string {
  const dpr = resolveTicketCanvasDpr();
  const paintScale = resolveTicketCanvasPaintScale(dpr, GRID_CANVAS_QUALITY);
  const { displayScale } = resolveTicketDisplayBufferSize(
    TICKET_DESIGN_WIDTH,
    TICKET_DESIGN_HEIGHT,
    dpr,
    paintScale,
    GRID_CANVAS_QUALITY,
  );
  return `${dpr.toFixed(4)}|${paintScale}|${displayScale}|${isConstrainedDevice() || isMobileTicketLayout() ? "m181" : "d197"}`;
}

let ticketSpriteCacheRenderKey = "";

/** Per-ticket bitmap cache — avoids repainting chrome+text on every viewport frame. */
const ticketSpriteCache = new Map<string, HTMLCanvasElement>();
const TICKET_SPRITE_CACHE_MAX = 512;

function evictOldestTicketSprite(): void {
  const oldest = ticketSpriteCache.keys().next().value;
  if (oldest !== undefined) ticketSpriteCache.delete(oldest);
}

function ensureTicketSprite(ticket: Ticket): HTMLCanvasElement | null {
  const renderKey = getTicketRenderKey();
  if (renderKey !== ticketSpriteCacheRenderKey) {
    ticketSpriteCache.clear();
    ticketSpriteCacheRenderKey = renderKey;
  }

  const cacheKey = `${renderKey}|${getTicketFingerprint(ticket)}`;
  const cached = ticketSpriteCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const layers = createTicketFrameLayers(ticketBodyValues(ticket), {
    quality: GRID_CANVAS_QUALITY,
    domMatchedText: true,
    ticketId: ticket.id,
    fonts: {
      body: resolveTicketBodyFontSpec(),
      id: resolveTicketIdFontSpec(),
    },
    displayAtlases: getTicketDisplayFontAtlases() ?? undefined,
  });

  const painted = paintTicketFrame(
    canvas,
    TICKET_DESIGN_WIDTH,
    TICKET_DESIGN_HEIGHT,
    layers,
    { mode: GRID_CANVAS_QUALITY, domMatched: true },
  );
  if (!painted) return null;

  if (ticketSpriteCache.size >= TICKET_SPRITE_CACHE_MAX) {
    evictOldestTicketSprite();
  }
  ticketSpriteCache.set(cacheKey, canvas);
  return canvas;
}

export function resetTicketSpriteCache(): void {
  ticketSpriteCache.clear();
  ticketSpriteCacheRenderKey = "";
}

/**
 * Paint one ticket at the current DPR. Reuses a per-fingerprint sprite bitmap
 * so scroll/add only repaints newly visible tickets once.
 */
export function paintTicketOnViewport(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ticket: Ticket,
  x: number,
  y: number,
  displayScale: number,
): void {
  const sprite = ensureTicketSprite(ticket);
  if (!sprite) return;

  const expectedW = Math.max(1, Math.round(TICKET_DESIGN_WIDTH * displayScale));
  const expectedH = Math.max(1, Math.round(TICKET_DESIGN_HEIGHT * displayScale));
  if (sprite.width !== expectedW || sprite.height !== expectedH) return;

  blitTicketSpriteToViewport(
    ctx,
    sprite,
    x,
    y,
    TICKET_DESIGN_WIDTH,
    TICKET_HEIGHT,
    displayScale,
  );
}

/** @deprecated Grid paints on demand; kept for callers that pre-warm. */
export function refreshTicketSprites(_tickets: Ticket[]): void {
  resetTicketSpriteCache();
}

/**
 * Full ticket sprite (chrome + text) — used by /ticket lab and strips.
 */
export function createTicketSprite(
  ticket: Ticket,
  quality: CanvasQualityMode = GRID_CANVAS_QUALITY,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  paintWithCanvasQuality(
    canvas,
    TICKET_DESIGN_WIDTH,
    TICKET_DESIGN_HEIGHT,
    createTicketFrameLayers(ticketBodyValues(ticket), {
      quality,
      ticketId: ticket.id,
      fonts: {
        body: resolveTicketBodyFontSpec(),
        id: resolveTicketIdFontSpec(),
      },
      displayAtlases: getTicketDisplayFontAtlases() ?? undefined,
    }),
    { mode: quality },
  );

  return canvas;
}

/** @deprecated Use drawTicketCanvas2D — kept for paintTicketStrip. */
export function drawTicket(
  ctx: CanvasRenderingContext2D,
  ticket: Ticket,
  x: number,
  y: number,
  width: number,
) {
  ctx.save();
  ctx.translate(x, y);
  if (width !== TICKET_DESIGN_WIDTH) {
    ctx.scale(width / TICKET_DESIGN_WIDTH, TICKET_HEIGHT / TICKET_DESIGN_HEIGHT);
  }
  drawTicketCanvas2D(
    ctx,
    ticketBodyValues(ticket),
    TICKET_DESIGN_WIDTH,
    TICKET_DESIGN_HEIGHT,
  );
  ctx.restore();
}

let gridFontsReady: Promise<void> | null = null;
let gridFontsRenderKey = "";

export function resetGridTicketFontCache(): void {
  gridFontsReady = null;
  gridFontsRenderKey = "";
}

/** Call once before batch sprite creation so Onest metrics are stable. */
export function ensureGridTicketFontsReady(): Promise<void> {
  const renderKey = getTicketRenderKey();
  if (gridFontsReady && gridFontsRenderKey === renderKey) {
    return gridFontsReady;
  }

  gridFontsRenderKey = renderKey;
  gridFontsReady = Promise.all([
    ensureTicketFontsReady(
      resolveTicketBodyFontSpec(),
      resolveTicketIdFontSpec(),
    ),
    ensureTicketDisplayFontAtlases(),
  ]).then(() => undefined);

  return gridFontsReady;
}

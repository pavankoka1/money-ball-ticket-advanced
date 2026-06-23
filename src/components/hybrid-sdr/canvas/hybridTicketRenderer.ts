import {
  resolveTicketCanvasDpr,
  resolveTicketCanvasPaintScale,
  type TicketCanvasQualityMode,
} from "@/lib/canvasSetup";
import {
  blitTicketSpriteToViewport,
  getCached2dContext,
  syncTicketDisplayCanvas,
} from "@/lib/canvasContext";
import { createTicketFrameLayers } from "@/lib/ticketFrameLayers";
import type { TicketFrameLayers } from "@/lib/ticketFrameLayers";
import {
  TICKET_DESIGN_HEIGHT,
  TICKET_DESIGN_WIDTH,
} from "@/lib/ticketDesign";
import {
  ensureTicketDisplayFontAtlases,
  getTicketDisplayFontAtlases,
} from "@/lib/ticketDisplayAtlases";
import {
  getTicketRenderKey,
  ticketBodyValues,
} from "@/lib/ticketRenderer";
import {
  resolveTicketBodyFontSpec,
  resolveTicketIdFontSpec,
} from "@/lib/ticketFonts";
import { TICKET_HEIGHT, type Ticket } from "@/types/ticket";

const HYBRID_CANVAS_QUALITY: TicketCanvasQualityMode = "enhanced";

const HYBRID_TEXT_SPRITE_CACHE_MAX = 512;

let sharedChromeSprite: HTMLCanvasElement | null = null;
let sharedChromeRenderKey = "";

const hybridTextSpriteCache = new Map<string, HTMLCanvasElement>();
let hybridTextSpriteCacheRenderKey = "";

function getHybridTextFingerprint(ticket: Ticket): string {
  return `${ticket.id}:${ticketBodyValues(ticket).join(",")}`;
}

function createHybridTicketLayers(ticket: Ticket | null): TicketFrameLayers {
  return createTicketFrameLayers(ticket ? ticketBodyValues(ticket) : [], {
    quality: HYBRID_CANVAS_QUALITY,
    domMatchedText: true,
    ticketId: ticket?.id,
    fonts: {
      body: resolveTicketBodyFontSpec(),
      id: resolveTicketIdFontSpec(),
    },
    displayAtlases: getTicketDisplayFontAtlases() ?? undefined,
  });
}

function paintHybridChromeBuffer(
  displayCanvas: HTMLCanvasElement,
  layers: TicketFrameLayers,
): number | null {
  const dpr = resolveTicketCanvasDpr();
  const paintScale = resolveTicketCanvasPaintScale(dpr, HYBRID_CANVAS_QUALITY);
  const { bufferW, bufferH, displayScale } = syncTicketDisplayCanvas(
    displayCanvas,
    TICKET_DESIGN_WIDTH,
    TICKET_DESIGN_HEIGHT,
    dpr,
    HYBRID_CANVAS_QUALITY,
    paintScale,
  );

  const displayCtx = getCached2dContext(displayCanvas);
  if (!displayCtx) return null;

  displayCtx.setTransform(1, 0, 0, 1, 0, 0);
  displayCtx.clearRect(0, 0, bufferW, bufferH);
  displayCtx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
  layers.paintChrome(displayCtx as CanvasRenderingContext2D, displayScale);
  return displayScale;
}

function paintHybridTextBuffer(
  displayCanvas: HTMLCanvasElement,
  layers: TicketFrameLayers,
): number | null {
  const dpr = resolveTicketCanvasDpr();
  const paintScale = resolveTicketCanvasPaintScale(dpr, HYBRID_CANVAS_QUALITY);
  const { bufferW, bufferH, displayScale } = syncTicketDisplayCanvas(
    displayCanvas,
    TICKET_DESIGN_WIDTH,
    TICKET_DESIGN_HEIGHT,
    dpr,
    HYBRID_CANVAS_QUALITY,
    paintScale,
  );

  const displayCtx = getCached2dContext(displayCanvas);
  if (!displayCtx) return null;

  displayCtx.setTransform(1, 0, 0, 1, 0, 0);
  displayCtx.clearRect(0, 0, bufferW, bufferH);
  displayCtx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
  layers.paintText(displayCtx as CanvasRenderingContext2D, displayScale);
  return displayScale;
}

function evictOldestHybridTextSprite(): void {
  const oldest = hybridTextSpriteCache.keys().next().value;
  if (oldest !== undefined) hybridTextSpriteCache.delete(oldest);
}

function ensureSharedChromeSprite(): HTMLCanvasElement | null {
  const renderKey = getTicketRenderKey();
  if (sharedChromeSprite && sharedChromeRenderKey === renderKey) {
    return sharedChromeSprite;
  }

  const canvas = document.createElement("canvas");
  const layers = createHybridTicketLayers(null);
  if (paintHybridChromeBuffer(canvas, layers) === null) return null;

  sharedChromeSprite = canvas;
  sharedChromeRenderKey = renderKey;
  return canvas;
}

function ensureHybridTextSprite(ticket: Ticket): HTMLCanvasElement | null {
  const renderKey = getTicketRenderKey();
  if (renderKey !== hybridTextSpriteCacheRenderKey) {
    hybridTextSpriteCache.clear();
    hybridTextSpriteCacheRenderKey = renderKey;
  }

  const cacheKey = `${renderKey}|${getHybridTextFingerprint(ticket)}`;
  const cached = hybridTextSpriteCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const layers = createHybridTicketLayers(ticket);
  if (paintHybridTextBuffer(canvas, layers) === null) return null;

  if (hybridTextSpriteCache.size >= HYBRID_TEXT_SPRITE_CACHE_MAX) {
    evictOldestHybridTextSprite();
  }
  hybridTextSpriteCache.set(cacheKey, canvas);
  return canvas;
}

export function resetHybridTicketRenderCaches(): void {
  sharedChromeSprite = null;
  sharedChromeRenderKey = "";
  hybridTextSpriteCache.clear();
  hybridTextSpriteCacheRenderKey = "";
}

/** Bake shared chrome once — reused for every ticket cell. */
export function ensureSharedChromeReady(): HTMLCanvasElement | null {
  return ensureSharedChromeSprite();
}

/** Blit pre-baked shared chrome (background + dividers) at slot position. */
export function blitSharedChromeAt(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  displayScale: number,
): void {
  const chrome = ensureSharedChromeSprite();
  if (!chrome) return;

  const expectedW = Math.max(1, Math.round(TICKET_DESIGN_WIDTH * displayScale));
  const expectedH = Math.max(1, Math.round(TICKET_DESIGN_HEIGHT * displayScale));
  if (chrome.width !== expectedW || chrome.height !== expectedH) return;

  blitTicketSpriteToViewport(
    ctx,
    chrome,
    x,
    y,
    TICKET_DESIGN_WIDTH,
    TICKET_HEIGHT,
    displayScale,
  );
}

/** Blit domMatched text-only sprite (fallback when worker text bitmap missing). */
export function blitTicketTextAt(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ticket: Ticket,
  x: number,
  y: number,
  displayScale: number,
): void {
  const text = ensureHybridTextSprite(ticket);
  if (!text) return;

  const expectedW = Math.max(1, Math.round(TICKET_DESIGN_WIDTH * displayScale));
  const expectedH = Math.max(1, Math.round(TICKET_DESIGN_HEIGHT * displayScale));
  if (text.width !== expectedW || text.height !== expectedH) return;

  blitTicketSpriteToViewport(
    ctx,
    text,
    x,
    y,
    TICKET_DESIGN_WIDTH,
    TICKET_HEIGHT,
    displayScale,
  );
}

/** Composite shared chrome + domMatched text — used for sticky animation canvas. */
export function paintHybridTicketOnViewport(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ticket: Ticket,
  x: number,
  y: number,
  displayScale: number,
): void {
  const chrome = ensureSharedChromeSprite();
  const text = ensureHybridTextSprite(ticket);
  if (!chrome || !text) return;

  const expectedW = Math.max(1, Math.round(TICKET_DESIGN_WIDTH * displayScale));
  const expectedH = Math.max(1, Math.round(TICKET_DESIGN_HEIGHT * displayScale));
  if (chrome.width !== expectedW || chrome.height !== expectedH) return;
  if (text.width !== expectedW || text.height !== expectedH) return;

  blitSharedChromeAt(ctx, x, y, displayScale);
  blitTicketTextAt(ctx, ticket, x, y, displayScale);
}

export function ensureHybridTicketRenderReady(): Promise<void> {
  return ensureTicketDisplayFontAtlases().then(() => undefined);
}

/** Bake text sprites ahead of paint so compositing stays cheap (drawImage only). */
export async function prefetchHybridTextSprites(
  tickets: readonly Ticket[],
  options?: { chunkSize?: number; signal?: AbortSignal },
): Promise<void> {
  if (tickets.length === 0) return;
  ensureSharedChromeReady();

  const chunkSize = options?.chunkSize ?? 10;
  for (let offset = 0; offset < tickets.length; ) {
    if (options?.signal?.aborted) return;
    const end = Math.min(offset + chunkSize, tickets.length);
    for (let i = offset; i < end; i++) {
      ensureHybridTextSprite(tickets[i]);
    }
    offset = end;
    if (offset < tickets.length) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }
}

/**
 * Warm digit glyphs (1–60) on idle — atlas digits are shared; this primes measureText/layout
 * caches so first real ticket bakes are cheaper.
 */
export function scheduleWarmHybridDigitSprites(maxValue = 60): void {
  const run = () => {
    ensureSharedChromeReady();
    for (let value = 1; value <= maxValue; value++) {
      const stub: Ticket = {
        id: value,
        cells: Array.from({ length: 6 }, () => ({ type: "number", value })),
        isWinning: false,
      };
      ensureHybridTextSprite(stub);
    }
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 8000 });
  } else {
    setTimeout(run, 500);
  }
}

import type { TicketCanvasQualityMode } from "@/lib/canvasSetup";
import {
  resolveTicketCanvasDpr,
  resolveTicketCanvasPaintScale,
} from "@/lib/canvasSetup";
import {
  blitTicketSpriteToViewport,
  getCached2dContext,
  syncTicketDisplayCanvas,
} from "@/lib/canvasContext";
import { createTicketFrameLayers } from "@/lib/ticketFrameLayers";
import type { TicketFrameLayers } from "@/lib/ticketFrameLayers";
import { TICKET_DESIGN_HEIGHT, TICKET_DESIGN_WIDTH, TICKET_MOBILE_DESIGN_WIDTH, ticketMobileBodyFont, ticketMobileIdFont } from "@/lib/ticketDesign";
import {
  ensureTicketDisplayFontAtlases,
  getTicketDisplayFontAtlases,
} from "@/lib/ticketDisplayAtlases";
import { paintTicketTextFrame } from "@/lib/paintTicketFrame";
import {
  getTicketRenderKey,
  ticketBodyValues,
} from "@/lib/ticketRenderer";
import {
  resolveTicketBodyFontSpec,
  resolveTicketIdFontSpec,
} from "@/lib/ticketFonts";
import { isConstrainedDevice } from "@/lib/deviceMemoryBudget";
import { isMobileTicketLayout } from "@/lib/ticketGridLayout";
import { getHybridTextSpriteCacheMax } from "@/lib/deviceMemoryBudget";
import { logTicketDomCanvasParityIfNeeded } from "@/lib/ticketDomParity";
import { TICKET_HEIGHT, type Ticket } from "@/types/ticket";

const HYBRID_CANVAS_QUALITY: TicketCanvasQualityMode = "enhanced";

let sharedChromeSprite: HTMLCanvasElement | null = null;
let sharedChromeRenderKey = "";

const hybridTextSpriteCache = new Map<string, HTMLCanvasElement>();
let hybridTextSpriteCacheRenderKey = "";

function getHybridTextFingerprint(ticket: Ticket): string {
  return `${ticket.id}:${ticketBodyValues(ticket).join(",")}`;
}

function isHybridMobileRenderer(): boolean {
  return isConstrainedDevice() || isMobileTicketLayout();
}

function getHybridTicketLogicalSize(): { width: number; height: number } {
  if (isHybridMobileRenderer()) {
    return { width: TICKET_MOBILE_DESIGN_WIDTH, height: TICKET_DESIGN_HEIGHT };
  }
  return { width: TICKET_DESIGN_WIDTH, height: TICKET_DESIGN_HEIGHT };
}

function createHybridTicketLayers(ticket: Ticket | null): TicketFrameLayers {
  const mobile = isHybridMobileRenderer();
  const { width, height } = getHybridTicketLogicalSize();
  return createTicketFrameLayers(ticket ? ticketBodyValues(ticket) : [], {
    quality: HYBRID_CANVAS_QUALITY,
    domMatchedText: true,
    ticketId: ticket?.id,
    width,
    height,
    fonts: {
      body: mobile ? ticketMobileBodyFont() : resolveTicketBodyFontSpec(),
      id: mobile ? ticketMobileIdFont() : resolveTicketIdFontSpec(),
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
  const { width, height } = getHybridTicketLogicalSize();
  const { bufferW, bufferH, displayScale } = syncTicketDisplayCanvas(
    displayCanvas,
    width,
    height,
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
  const { width, height } = getHybridTicketLogicalSize();
  const result = paintTicketTextFrame(
    displayCanvas,
    width,
    height,
    layers,
    { mode: HYBRID_CANVAS_QUALITY, domMatched: true },
  );
  return result?.displayScale ?? null;
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

  if (hybridTextSpriteCache.size >= getHybridTextSpriteCacheMax()) {
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

function invalidateSharedChromeSprite(): void {
  sharedChromeSprite = null;
  sharedChromeRenderKey = "";
}

function spriteMatchesDisplayScale(
  sprite: HTMLCanvasElement,
  displayScale: number,
  logicalW = getHybridTicketLogicalSize().width,
): boolean {
  const expectedW = Math.max(1, Math.round(logicalW * displayScale));
  const expectedH = Math.max(1, Math.round(TICKET_DESIGN_HEIGHT * displayScale));
  return sprite.width === expectedW && sprite.height === expectedH;
}

/** Desktop chrome/text sprites stretched onto 181px mobile slots only when baked at 197px. */
function needsMobileSpriteStretch(
  sprite: HTMLCanvasElement,
  displayScale: number,
  logicalW: number,
): boolean {
  if (logicalW !== TICKET_MOBILE_DESIGN_WIDTH) return false;
  const desktopW = Math.max(1, Math.round(TICKET_DESIGN_WIDTH * displayScale));
  return sprite.width === desktopW;
}

/** Blit pre-baked shared chrome (background + dividers) at slot position. */
export function blitSharedChromeAt(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  displayScale: number,
  logicalW = TICKET_DESIGN_WIDTH,
  logicalH = TICKET_HEIGHT,
): void {
  let chrome = ensureSharedChromeSprite();
  if (!chrome) return;

  if (!spriteMatchesDisplayScale(chrome, displayScale, logicalW)) {
    invalidateSharedChromeSprite();
    chrome = ensureSharedChromeSprite();
    if (!chrome || !spriteMatchesDisplayScale(chrome, displayScale, logicalW)) return;
  }

  const allowScale = needsMobileSpriteStretch(chrome, displayScale, logicalW);
  blitTicketSpriteToViewport(
    ctx,
    chrome,
    x,
    y,
    logicalW,
    logicalH,
    displayScale,
    { allowScale },
  );
}

/** Blit domMatched text-only sprite (fallback when worker text bitmap missing). */
export function blitTicketTextAt(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ticket: Ticket,
  x: number,
  y: number,
  displayScale: number,
  logicalW = TICKET_DESIGN_WIDTH,
  logicalH = TICKET_HEIGHT,
): void {
  let text = ensureHybridTextSprite(ticket);
  if (!text) return;

  if (!spriteMatchesDisplayScale(text, displayScale, logicalW)) {
    hybridTextSpriteCache.delete(
      `${getTicketRenderKey()}|${getHybridTextFingerprint(ticket)}`,
    );
    text = ensureHybridTextSprite(ticket);
    if (!text || !spriteMatchesDisplayScale(text, displayScale, logicalW)) return;
  }

  const allowScale = needsMobileSpriteStretch(text, displayScale, logicalW);
  blitTicketSpriteToViewport(
    ctx,
    text,
    x,
    y,
    logicalW,
    logicalH,
    displayScale,
    { allowScale },
  );
}

/** Composite shared chrome + domMatched text — used for sticky animation canvas. */
export function paintHybridTicketOnViewport(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ticket: Ticket,
  x: number,
  y: number,
  displayScale: number,
  logicalW?: number,
): void {
  const w = logicalW ?? getHybridTicketLogicalSize().width;
  blitSharedChromeAt(ctx, x, y, displayScale, w, TICKET_HEIGHT);
  blitTicketTextAt(ctx, ticket, x, y, displayScale, w, TICKET_HEIGHT);
}

export function ensureHybridTicketRenderReady(): Promise<void> {
  return ensureTicketDisplayFontAtlases().then(() => {
    logTicketDomCanvasParityIfNeeded();
  });
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

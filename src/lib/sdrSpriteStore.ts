import {
  resolveTicketCanvasDpr,
  resolveTicketCanvasPaintScale,
} from "@/lib/canvasSetup";
import { blitTicketSpriteToViewport } from "@/lib/canvasContext";
import {
  createFontAtlasTransfer,
  type FontAtlasTransfer,
} from "@/lib/renderers/fontAtlas";
import {
  ensureTicketDisplayFontAtlases,
} from "@/lib/ticketDisplayAtlases";
import {
  ensureGridTicketFontsReady,
  getTicketFingerprint,
  getTicketRenderKey,
  ticketBodyValues,
} from "@/lib/ticketRenderer";
import {
  blobToImageBitmap,
  idbClearSprites,
  idbGetSprite,
  idbPutSprite,
  imageBitmapToBlob,
} from "@/lib/sdrSpriteIdb";
import type { Ticket } from "@/types/ticket";
import { TICKET_DESIGN_HEIGHT, TICKET_DESIGN_WIDTH } from "@/lib/ticketDesign";
import { TICKET_HEIGHT } from "@/types/ticket";
import type {
  SdrSpriteBakeJob,
  SdrSpriteWorkerRequest,
  SdrSpriteWorkerResponse,
} from "@/workers/sdrSprite.worker.types";
import { getSdrDisplayScale } from "@/lib/sdrDisplayScale";

const SDR_QUALITY = "enhanced" as const;
const MEMORY_CACHE_MAX = 1024;
const WORKER_BATCH_SIZE = 8;

type CachedSprite = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
};

const SDR_SPRITE_BAKE_VERSION = "sdr-atlas-v4";
const SDR_TEXT_SPRITE_BAKE_VERSION = "sdr-text-v1";

class SdrSpriteStoreClass {
  private memory = new Map<string, CachedSprite>();
  private memoryRenderKey = "";
  private worker: Worker | null = null;
  private workerReady = false;
  private initPromise: Promise<void> | null = null;
  private pendingBakes = new Map<
    number,
    {
      resolve: () => void;
      reject: (err: Error) => void;
    }
  >();
  private requestId = 0;

  getCacheKey(ticket: Ticket): string {
    return `${SDR_SPRITE_BAKE_VERSION}|${getTicketRenderKey()}|${getTicketFingerprint(ticket)}`;
  }

  getTextCacheKey(ticket: Ticket): string {
    return `${SDR_TEXT_SPRITE_BAKE_VERSION}|${getTicketRenderKey()}|${getTicketFingerprint(ticket)}`;
  }

  async init(): Promise<void> {
    if (this.workerReady) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    await ensureGridTicketFontsReady();
    if (typeof document !== "undefined") {
      await document.fonts.ready;
    }

    const atlases = await ensureTicketDisplayFontAtlases();
    if (!atlases?.body.tintedByColor || !atlases.id.tintedByColor) {
      throw new Error(
        "Ticket bitmap font atlases failed to build — ensure Onest is loaded",
      );
    }

    const [bodyTransfer, idTransfer] = await Promise.all([
      createFontAtlasTransfer(atlases.body),
      createFontAtlasTransfer(atlases.id),
    ]);

    const dpr = resolveTicketCanvasDpr();
    const paintScale = resolveTicketCanvasPaintScale(dpr, SDR_QUALITY);
    const displayScale = getSdrDisplayScale();
    const renderKey = getTicketRenderKey();

    const worker = new Worker(
      new URL("@/workers/sdrSprite.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker = worker;

    await new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<SdrSpriteWorkerResponse>) => {
        const msg = event.data;
        if (msg.type === "worker-ready") {
          worker.removeEventListener("message", onMessage);
          this.workerReady = true;
          resolve();
          return;
        }
        if (msg.type === "worker-error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(msg.message));
        }
      };
      worker.addEventListener("message", onMessage);

      const initMsg: SdrSpriteWorkerRequest = {
        type: "init",
        renderKey,
        dpr,
        paintScale,
        displayScale,
        bodyAtlas: toAtlasPayload(bodyTransfer),
        idAtlas: toAtlasPayload(idTransfer),
        bodyBitmap: bodyTransfer.bitmap,
        idBitmap: idTransfer.bitmap,
      };
      worker.postMessage(initMsg, [
        bodyTransfer.bitmap,
        idTransfer.bitmap,
      ]);
    });

    worker.onmessage = (event: MessageEvent<SdrSpriteWorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };
  }

  private handleWorkerMessage(msg: SdrSpriteWorkerResponse): void {
    if (msg.type === "worker-error") {
      for (const pending of this.pendingBakes.values()) {
        pending.reject(new Error(msg.message));
      }
      this.pendingBakes.clear();
      return;
    }

    if (msg.type !== "batch-done") return;

    const pending = this.pendingBakes.get(msg.requestId);
    for (const sprite of msg.sprites) {
      void this.storeSprite(sprite.cacheKey, sprite.bitmap, sprite.width, sprite.height);
    }
    pending?.resolve();
    this.pendingBakes.delete(msg.requestId);
  }

  private async storeSprite(
    cacheKey: string,
    bitmap: ImageBitmap,
    width: number,
    height: number,
  ): Promise<void> {
    this.putMemory(cacheKey, { bitmap, width, height });
    try {
      const blob = await imageBitmapToBlob(bitmap);
      await idbPutSprite({ cacheKey, width, height, blob });
    } catch {
      // IDB persistence is best-effort
    }
  }

  private putMemory(cacheKey: string, entry: CachedSprite): void {
    const renderKey = getTicketRenderKey();
    if (renderKey !== this.memoryRenderKey) {
      this.clearMemory();
      this.memoryRenderKey = renderKey;
    }
    if (this.memory.size >= MEMORY_CACHE_MAX) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) {
        this.memory.get(oldest)?.bitmap.close();
        this.memory.delete(oldest);
      }
    }
    this.memory.set(cacheKey, entry);
  }

  private clearMemory(): void {
    for (const entry of this.memory.values()) {
      entry.bitmap.close();
    }
    this.memory.clear();
  }

  async getTextBitmap(ticket: Ticket): Promise<ImageBitmap | null> {
    await this.init();
    const cacheKey = this.getTextCacheKey(ticket);
    const renderKey = getTicketRenderKey();

    if (renderKey !== this.memoryRenderKey) {
      this.clearMemory();
      this.memoryRenderKey = renderKey;
    }

    const mem = this.memory.get(cacheKey);
    if (mem) return mem.bitmap;

    const stored = await idbGetSprite(cacheKey);
    if (stored) {
      const bitmap = await blobToImageBitmap(stored.blob);
      this.putMemory(cacheKey, {
        bitmap,
        width: stored.width,
        height: stored.height,
      });
      return bitmap;
    }

    return null;
  }

  async ensureTextSpritesForTickets(
    tickets: readonly Ticket[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    if (tickets.length === 0) return;
    await this.init();

    const missing: Ticket[] = [];
    for (const ticket of tickets) {
      const cacheKey = this.getTextCacheKey(ticket);
      if (this.memory.has(cacheKey)) continue;
      const stored = await idbGetSprite(cacheKey);
      if (stored) {
        const bitmap = await blobToImageBitmap(stored.blob);
        this.putMemory(cacheKey, {
          bitmap,
          width: stored.width,
          height: stored.height,
        });
        continue;
      }
      missing.push(ticket);
    }

    const total = tickets.length;
    let done = total - missing.length;
    onProgress?.(done, total);

    if (missing.length === 0) return;

    for (let offset = 0; offset < missing.length; offset += WORKER_BATCH_SIZE) {
      const batch = missing.slice(offset, offset + WORKER_BATCH_SIZE);
      await this.bakeBatch(batch, true);
      done += batch.length;
      onProgress?.(done, total);
    }
  }

  scheduleBackgroundTextBake(tickets: readonly Ticket[]): void {
    if (tickets.length === 0) return;
    const run = () => {
      void this.ensureTextSpritesForTickets(tickets).catch(() => undefined);
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(run, { timeout: 4000 });
    } else {
      setTimeout(run, 250);
    }
  }

  async getBitmap(ticket: Ticket): Promise<ImageBitmap | null> {
    await this.init();
    const cacheKey = this.getCacheKey(ticket);
    const renderKey = getTicketRenderKey();

    if (renderKey !== this.memoryRenderKey) {
      this.clearMemory();
      this.memoryRenderKey = renderKey;
    }

    const mem = this.memory.get(cacheKey);
    if (mem) return mem.bitmap;

    const stored = await idbGetSprite(cacheKey);
    if (stored) {
      const bitmap = await blobToImageBitmap(stored.blob);
      this.putMemory(cacheKey, {
        bitmap,
        width: stored.width,
        height: stored.height,
      });
      return bitmap;
    }

    return null;
  }

  async ensureSpritesForTickets(
    tickets: readonly Ticket[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    if (tickets.length === 0) return;
    await this.init();

    const missing: Ticket[] = [];
    for (const ticket of tickets) {
      const cacheKey = this.getCacheKey(ticket);
      if (this.memory.has(cacheKey)) continue;
      const stored = await idbGetSprite(cacheKey);
      if (stored) {
        const bitmap = await blobToImageBitmap(stored.blob);
        this.putMemory(cacheKey, {
          bitmap,
          width: stored.width,
          height: stored.height,
        });
        continue;
      }
      missing.push(ticket);
    }

    const total = tickets.length;
    let done = total - missing.length;
    onProgress?.(done, total);

    if (missing.length === 0) return;

    for (let offset = 0; offset < missing.length; offset += WORKER_BATCH_SIZE) {
      const batch = missing.slice(offset, offset + WORKER_BATCH_SIZE);
      await this.bakeBatch(batch);
      done += batch.length;
      onProgress?.(done, total);
    }
  }

  async ensureSprites(
    tickets: readonly Ticket[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    return this.ensureSpritesForTickets(tickets, onProgress);
  }

  /** Bake remaining sprites when the browser is idle — does not block UI. */
  scheduleBackgroundBake(tickets: readonly Ticket[]): void {
    if (tickets.length === 0) return;
    const run = () => {
      void this.ensureSpritesForTickets(tickets).catch(() => undefined);
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(run, { timeout: 4000 });
    } else {
      setTimeout(run, 250);
    }
  }

  private bakeBatch(tickets: Ticket[], textOnly = false): Promise<void> {
    if (!this.worker || !this.workerReady) {
      return Promise.reject(new Error("SDR sprite worker not ready"));
    }

    const requestId = ++this.requestId;
    const jobs: SdrSpriteBakeJob[] = tickets.map((ticket) => ({
      cacheKey: textOnly ? this.getTextCacheKey(ticket) : this.getCacheKey(ticket),
      ticketId: ticket.id,
      values: ticketBodyValues(ticket),
    }));

    return new Promise((resolve, reject) => {
      this.pendingBakes.set(requestId, { resolve, reject });
      const msg: SdrSpriteWorkerRequest = {
        type: "bake-batch",
        requestId,
        jobs,
        textOnly,
      };
      this.worker!.postMessage(msg);
    });
  }

  async reset(): Promise<void> {
    this.clearMemory();
    this.memoryRenderKey = "";
    await idbClearSprites();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = false;
    this.initPromise = null;
    this.clearMemory();
  }
}

function toAtlasPayload(transfer: FontAtlasTransfer) {
  return {
    textureWidth: transfer.textureWidth,
    textureHeight: transfer.textureHeight,
    fontSize: transfer.fontSize,
    glyphs: transfer.glyphs,
  };
}

export const sdrSpriteStore = new SdrSpriteStoreClass();

export function paintSdrTicketBitmap(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  x: number,
  y: number,
): void {
  const displayScale = getSdrDisplayScale();
  const expectedW = Math.max(1, Math.round(TICKET_DESIGN_WIDTH * displayScale));
  const expectedH = Math.max(1, Math.round(TICKET_DESIGN_HEIGHT * displayScale));
  if (bitmap.width !== expectedW || bitmap.height !== expectedH) return;

  blitTicketSpriteToViewport(
    ctx,
    bitmap,
    x,
    y,
    TICKET_DESIGN_WIDTH,
    TICKET_HEIGHT,
    displayScale,
  );
}

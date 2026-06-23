import { attachTintedGlyphCache, fontAtlasFromTransfer } from "@/lib/renderers/fontAtlas";
import { createTicketFrameLayers } from "@/lib/ticketFrameLayers";
import { paintTicketFrame } from "@/lib/paintTicketFrame";
import {
  TICKET_DESIGN_HEIGHT,
  TICKET_DESIGN_WIDTH,
  TICKET_ID_TEXT,
  TICKET_TEXT,
} from "@/lib/ticketDesign";
import {
  resolveTicketBodyFontSpec,
  resolveTicketIdFontSpec,
} from "@/lib/ticketFonts";
import type {
  SdrSpriteWorkerBake,
  SdrSpriteWorkerInit,
  SdrSpriteWorkerRequest,
  SdrSpriteWorkerResponse,
} from "@/workers/sdrSprite.worker.types";

const SDR_QUALITY = "enhanced" as const;

let bodyAtlas: ReturnType<typeof fontAtlasFromTransfer> | null = null;
let idAtlas: ReturnType<typeof fontAtlasFromTransfer> | null = null;
let renderParams: {
  dpr: number;
  paintScale: number;
  displayScale: number;
} | null = null;

self.onmessage = async (event: MessageEvent<SdrSpriteWorkerRequest>) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      initWorker(msg);
      const response: SdrSpriteWorkerResponse = { type: "worker-ready" };
      self.postMessage(response);
    } catch (err) {
      postError(err);
    }
    return;
  }

  if (msg.type === "bake-batch") {
    await handleBakeBatch(msg);
  }
};

function initWorker(msg: SdrSpriteWorkerInit): void {
  bodyAtlas = fontAtlasFromTransfer({
    bitmap: msg.bodyBitmap,
    textureWidth: msg.bodyAtlas.textureWidth,
    textureHeight: msg.bodyAtlas.textureHeight,
    fontSize: msg.bodyAtlas.fontSize,
    glyphs: msg.bodyAtlas.glyphs,
  });
  idAtlas = fontAtlasFromTransfer({
    bitmap: msg.idBitmap,
    textureWidth: msg.idAtlas.textureWidth,
    textureHeight: msg.idAtlas.textureHeight,
    fontSize: msg.idAtlas.fontSize,
    glyphs: msg.idAtlas.glyphs,
  });
  attachTintedGlyphCache(bodyAtlas, [TICKET_TEXT.color]);
  attachTintedGlyphCache(idAtlas, [TICKET_ID_TEXT.color]);
  renderParams = {
    dpr: msg.dpr,
    paintScale: msg.paintScale,
    displayScale: msg.displayScale,
  };
}

function postError(err: unknown): void {
  const response: SdrSpriteWorkerResponse = {
    type: "worker-error",
    message: err instanceof Error ? err.message : "SDR sprite worker error",
  };
  self.postMessage(response);
}

async function handleBakeBatch(msg: SdrSpriteWorkerBake): Promise<void> {
  if (!bodyAtlas || !idAtlas || !renderParams) {
    postError(new Error("SDR sprite worker not initialized"));
    return;
  }

  try {
    const sprites: Array<{
      cacheKey: string;
      bitmap: ImageBitmap;
      width: number;
      height: number;
    }> = [];

    for (const job of msg.jobs) {
      const canvas = new OffscreenCanvas(1, 1);
      const layers = createTicketFrameLayers(job.values, {
        quality: SDR_QUALITY,
        domMatchedText: false,
        ticketId: job.ticketId,
        fonts: {
          body: resolveTicketBodyFontSpec(),
          id: resolveTicketIdFontSpec(),
        },
        displayAtlases: { body: bodyAtlas, id: idAtlas },
      });

      if (msg.textOnly) {
        const displayScale = renderParams.displayScale;
        const w = Math.max(1, Math.round(TICKET_DESIGN_WIDTH * displayScale));
        const h = Math.max(1, Math.round(TICKET_DESIGN_HEIGHT * displayScale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.clearRect(0, 0, w, h);
        ctx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
        layers.paintText(ctx as unknown as CanvasRenderingContext2D, displayScale);
      } else {
        const painted = paintTicketFrame(
          canvas,
          TICKET_DESIGN_WIDTH,
          TICKET_DESIGN_HEIGHT,
          layers,
          { mode: SDR_QUALITY, domMatched: false, dpr: renderParams.dpr },
        );
        if (!painted) continue;
      }

      const bitmap = await createImageBitmap(
        canvas,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      sprites.push({
        cacheKey: job.cacheKey,
        bitmap,
        width: canvas.width,
        height: canvas.height,
      });
    }

    const transferables = sprites.map((s) => s.bitmap);
    const response: SdrSpriteWorkerResponse = {
      type: "batch-done",
      requestId: msg.requestId,
      sprites,
    };
    self.postMessage(response, { transfer: transferables });
  } catch (err) {
    postError(err);
  }
}

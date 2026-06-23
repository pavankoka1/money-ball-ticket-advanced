export type SdrAtlasTransfer = {
  textureWidth: number;
  textureHeight: number;
  fontSize: number;
  glyphs: Record<
    string,
    import("@/lib/renderers/fontAtlas").GlyphMetrics
  >;
};

export type SdrSpriteWorkerInit = {
  type: "init";
  renderKey: string;
  dpr: number;
  paintScale: number;
  displayScale: number;
  bodyAtlas: SdrAtlasTransfer;
  idAtlas: SdrAtlasTransfer;
  bodyBitmap: ImageBitmap;
  idBitmap: ImageBitmap;
};

export type SdrSpriteBakeJob = {
  cacheKey: string;
  ticketId: number;
  values: number[];
};

export type SdrSpriteWorkerBake = {
  type: "bake-batch";
  requestId: number;
  jobs: SdrSpriteBakeJob[];
  /** Transparent text-only sprites (id + numbers) — chrome blitted separately on main thread. */
  textOnly?: boolean;
};

export type SdrSpriteWorkerReady = {
  type: "worker-ready";
};

export type SdrSpriteWorkerBatchDone = {
  type: "batch-done";
  requestId: number;
  sprites: Array<{
    cacheKey: string;
    bitmap: ImageBitmap;
    width: number;
    height: number;
  }>;
};

export type SdrSpriteWorkerError = {
  type: "worker-error";
  message: string;
};

export type SdrSpriteWorkerRequest = SdrSpriteWorkerInit | SdrSpriteWorkerBake;

export type SdrSpriteWorkerResponse =
  | SdrSpriteWorkerReady
  | SdrSpriteWorkerBatchDone
  | SdrSpriteWorkerError;

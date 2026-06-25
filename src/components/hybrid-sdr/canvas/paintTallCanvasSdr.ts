import type { TicketSlot } from "@/lib/ticketLayout";
import { getSdrDisplayScale } from "@/lib/sdrDisplayScale";
import {
  assertTileFitsPhysical,
  buildSdrTilePlan,
  getRowBandCssHeight,
  resolveMaxRowsPerTile,
  type SdrTilePlan,
} from "@/lib/sdrCanvasTiles";
import { ROW_HEIGHT, getTotalRows, type Ticket } from "@/types/ticket";
import {
  blitSharedChromeAt,
  blitTicketTextAt,
  ensureSharedChromeReady,
} from "./hybridTicketRenderer";

export type PaintTiledTallCanvasArgs = {
  tileCanvases: readonly HTMLCanvasElement[];
  cssWidth: number;
  ticketCount: number;
  layout: readonly TicketSlot[];
  tickets: readonly Ticket[];
  rowRange?: { startRow: number; endRow: number };
  onProgress?: (painted: number, total: number) => void;
};

/** Release an out-of-window tile's backing store (1×1) — frees GPU memory. */
function releaseTileCanvas(canvas: HTMLCanvasElement): void {
  if (canvas.width !== 1) canvas.width = 1;
  if (canvas.height !== 1) canvas.height = 1;
  canvas.style.width = "0";
  canvas.style.height = "0";
  canvas.style.visibility = "hidden";
}

function syncTileCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  compositorScale: number,
  tileIndex: number,
): CanvasRenderingContext2D | null {
  assertTileFitsPhysical(cssHeight, compositorScale);
  const w = Math.max(1, Math.round(cssWidth * compositorScale));
  const h = Math.max(1, Math.round(cssHeight * compositorScale));

  const sizeChanged = canvas.width !== w || canvas.height !== h;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  if (sizeChanged) {
    const mb = (w * h * 4) / 1_048_576;
    console.log(
      `[tile canvas] tile=${tileIndex} css=${cssWidth}×${cssHeight}px  physical=${w}×${h}px  scale=${compositorScale.toFixed(2)}x  mem≈${mb.toFixed(2)}MB`,
    );
  }

  canvas.style.visibility = "visible";
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.style.maxWidth = "none";

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  ctx.setTransform(compositorScale, 0, 0, compositorScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function slotRow(slot: TicketSlot): number {
  return Math.floor(slot.y / ROW_HEIGHT);
}

function shouldPaintSlot(
  slot: TicketSlot,
  plan: SdrTilePlan,
  rowRange?: { startRow: number; endRow: number },
): boolean {
  const row = slotRow(slot);
  if (row < plan.startRow || row >= plan.endRow) return false;
  if (rowRange && (row < rowRange.startRow || row >= rowRange.endRow)) return false;
  return true;
}

/** Clear only the row band being repainted — never wipe unrelated rows on the same tile. */
function clearRowBandInTile(
  ctx: CanvasRenderingContext2D,
  plan: SdrTilePlan,
  rowRange: { startRow: number; endRow: number },
  cssWidth: number,
  totalRows: number,
): void {
  const clearStartRow = Math.max(plan.startRow, rowRange.startRow);
  const clearEndRow = Math.min(plan.endRow, rowRange.endRow);
  if (clearEndRow <= clearStartRow) return;

  const y = (clearStartRow - plan.startRow) * ROW_HEIGHT;
  const h = getRowBandCssHeight(clearStartRow, clearEndRow, totalRows);
  if (h <= 0) return;
  ctx.clearRect(0, y, cssWidth, h);
}

function paintSlotLayers(
  ctx: CanvasRenderingContext2D,
  slot: TicketSlot,
  ticket: Ticket,
  tileTop: number,
  displayScale: number,
): void {
  const x = Math.round(slot.x);
  const y = Math.round(slot.y - tileTop);
  blitSharedChromeAt(ctx, x, y, displayScale);
  blitTicketTextAt(ctx, ticket, x, y, displayScale);
}

export type ChunkedTiledPaintArgs = PaintTiledTallCanvasArgs & {
  chunkSize?: number;
  signal?: AbortSignal;
  fullClear?: boolean;
  /**
   * Tile virtualization window [start, end). Tiles outside it are skipped, and
   * on full-grid paints their backing store is released. Omit to paint all tiles
   * (desktop / unconstrained: every tile stays resident, zero paint on scroll).
   */
  activeTileRange?: { start: number; end: number };
  /**
   * Incremental mode: paint ONLY these tile indices and leave every other tile
   * completely untouched (no clear, no release). Used by scroll reconcile so we
   * never repaint tiles that are already resident. Takes precedence over
   * activeTileRange when set.
   */
  paintTileIndices?: ReadonlySet<number>;
};

/**
 * Tall canvas paint — shared chrome blit (once baked) + domMatched text blit per ticket.
 * Fully synchronous on main thread; text sprites cache after first bake.
 */
export async function paintTiledTallCanvasSdrChunked({
  tileCanvases,
  cssWidth,
  ticketCount,
  layout,
  tickets,
  chunkSize = 12,
  signal,
  rowRange,
  fullClear = false,
  activeTileRange,
  paintTileIndices,
  onProgress,
}: ChunkedTiledPaintArgs): Promise<boolean> {
  const compositorScale = getSdrDisplayScale();
  const displayScale = compositorScale;
  const plans = buildSdrTilePlan(ticketCount, compositorScale);
  const totalRows = getTotalRows(ticketCount);
  const total = layout.length;
  let painted = 0;

  ensureSharedChromeReady();

  let missingCanvasForSlots = false;

  for (const plan of plans) {
    if (signal?.aborted) return false;

    const canvas = tileCanvases[plan.tileIndex];

    if (paintTileIndices) {
      // Incremental: paint only the requested tiles, leave all others alone.
      if (!paintTileIndices.has(plan.tileIndex)) continue;
    } else {
      const inWindow =
        !activeTileRange ||
        (plan.tileIndex >= activeTileRange.start && plan.tileIndex < activeTileRange.end);
      if (!inWindow) {
        // Out of the virtualization window — release its backing store on full
        // paints; leave partial (rowRange) paints untouched so we never wipe
        // content the user is still scrolling toward.
        if (!rowRange && canvas) releaseTileCanvas(canvas);
        continue;
      }
    }

    const slotsInTile = layout
      .map((slot) => ({ slot }))
      .filter(({ slot }) => shouldPaintSlot(slot, plan, rowRange));

    if (!canvas) {
      if (slotsInTile.length > 0) missingCanvasForSlots = true;
      continue;
    }

    const ctx = syncTileCanvas(canvas, cssWidth, plan.cssHeight, compositorScale, plan.tileIndex);
    if (!ctx) {
      if (slotsInTile.length > 0) missingCanvasForSlots = true;
      continue;
    }

    if (!rowRange || fullClear) {
      ctx.clearRect(0, 0, cssWidth, plan.cssHeight);
    } else {
      clearRowBandInTile(ctx, plan, rowRange, cssWidth, totalRows);
    }

    for (let offset = 0; offset < slotsInTile.length; ) {
      if (signal?.aborted) return false;
      const end = Math.min(offset + chunkSize, slotsInTile.length);

      for (let j = offset; j < end; j++) {
        const { slot } = slotsInTile[j];
        const ticket = tickets[slot.index];
        if (!ticket) continue;
        paintSlotLayers(ctx, slot, ticket, plan.cssTop, displayScale);
        painted += 1;
        onProgress?.(painted, total);
      }

      offset = end;
      if (offset < slotsInTile.length) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
  }

  return !missingCanvasForSlots;
}

export async function paintRemainingRowsChunked(
  args: Omit<ChunkedTiledPaintArgs, "rowRange" | "fullClear"> & {
    startRow: number;
    endRow: number;
    rowsPerChunk?: number;
    signal?: AbortSignal;
    isScrolling?: () => boolean;
  },
): Promise<boolean> {
  const rowsPerChunk =
    args.rowsPerChunk ?? Math.max(8, resolveMaxRowsPerTile(getSdrDisplayScale()) / 4);
  for (let start = args.startRow; start < args.endRow; start += rowsPerChunk) {
    if (args.signal?.aborted || args.isScrolling?.()) return false;
    const end = Math.min(start + rowsPerChunk, args.endRow);
    const ok = await paintTiledTallCanvasSdrChunked({
      ...args,
      rowRange: { startRow: start, endRow: end },
      fullClear: false,
    });
    if (!ok) return false;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  return true;
}

export async function resetSdrSpriteCaches(): Promise<void> {
  // Worker text cache optional; tall canvas uses hybrid chrome+text sprites.
}

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

function syncTileCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  compositorScale: number,
): CanvasRenderingContext2D | null {
  assertTileFitsPhysical(cssHeight, compositorScale);
  const w = Math.max(1, Math.round(cssWidth * compositorScale));
  const h = Math.max(1, Math.round(cssHeight * compositorScale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.visibility = "visible";
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

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

    const slotsInTile = layout
      .map((slot) => ({ slot }))
      .filter(({ slot }) => shouldPaintSlot(slot, plan, rowRange));

    const canvas = tileCanvases[plan.tileIndex];
    if (!canvas) {
      if (slotsInTile.length > 0) missingCanvasForSlots = true;
      continue;
    }

    const ctx = syncTileCanvas(canvas, cssWidth, plan.cssHeight, compositorScale);
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

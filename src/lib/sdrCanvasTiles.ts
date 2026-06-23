import { ROW_GAP, ROW_HEIGHT, getTotalRows } from "@/types/ticket";

/** Legacy cap — row alignment takes precedence. */
export const SDR_TILE_MAX_CSS_HEIGHT = 3600;

const MAX_PHYSICAL_SIDE = 8192;

export type SdrTilePlan = {
  tileIndex: number;
  tileCount: number;
  /** First row index in this tile (inclusive). */
  startRow: number;
  /** Last row index in this tile (exclusive). */
  endRow: number;
  cssTop: number;
  cssHeight: number;
};

/** Keep each tile's physical backing within the browser's max texture side. */
export function resolveSdrTileMaxCssHeight(compositorScale: number): number {
  const scale = Math.max(1, compositorScale);
  const capFromPhysical = Math.floor(MAX_PHYSICAL_SIDE / scale);
  return Math.min(SDR_TILE_MAX_CSS_HEIGHT, capFromPhysical);
}

/** Max complete ticket rows per tile — never split a row across tiles. */
export function resolveMaxRowsPerTile(compositorScale: number): number {
  const maxCss = resolveSdrTileMaxCssHeight(compositorScale);
  return Math.max(1, Math.floor((maxCss + ROW_GAP) / ROW_HEIGHT));
}

export function getRowBandCssHeight(
  startRow: number,
  endRow: number,
  totalRows: number,
): number {
  if (endRow <= startRow) return 0;
  const rows = endRow - startRow;
  const height = rows * ROW_HEIGHT;
  return endRow < totalRows ? height - ROW_GAP : height;
}

export function buildSdrTilePlan(
  ticketCount: number,
  compositorScale: number,
): SdrTilePlan[] {
  const totalRows = getTotalRows(ticketCount);
  if (totalRows <= 0) {
    return [
      {
        tileIndex: 0,
        tileCount: 1,
        startRow: 0,
        endRow: 0,
        cssTop: 0,
        cssHeight: 0,
      },
    ];
  }

  const maxRowsPerTile = resolveMaxRowsPerTile(compositorScale);
  const tileCount = Math.max(1, Math.ceil(totalRows / maxRowsPerTile));
  const plans: SdrTilePlan[] = [];

  for (let tileIndex = 0; tileIndex < tileCount; tileIndex++) {
    const startRow = tileIndex * maxRowsPerTile;
    const endRow = Math.min(totalRows, startRow + maxRowsPerTile);
    plans.push({
      tileIndex,
      tileCount,
      startRow,
      endRow,
      cssTop: startRow * ROW_HEIGHT,
      cssHeight: getRowBandCssHeight(startRow, endRow, totalRows),
    });
  }

  return plans;
}

export function computeSdrTileCount(
  ticketCount: number,
  compositorScale: number,
): number {
  return buildSdrTilePlan(ticketCount, compositorScale)[0]?.tileCount ?? 1;
}

/** @deprecated Prefer buildSdrTilePlan — kept for callers using css height. */
export function computeSdrTileCountFromHeight(
  contentHeightCss: number,
  compositorScale: number,
): number {
  if (contentHeightCss <= 0) return 1;
  const tileMax = resolveSdrTileMaxCssHeight(compositorScale);
  return Math.max(1, Math.ceil(contentHeightCss / tileMax));
}

export function getSdrTileCssHeight(
  tileIndex: number,
  ticketCount: number,
  compositorScale: number,
): number {
  return buildSdrTilePlan(ticketCount, compositorScale)[tileIndex]?.cssHeight ?? 0;
}

export function getSdrTileTopCss(
  tileIndex: number,
  ticketCount: number,
  compositorScale: number,
): number {
  return buildSdrTilePlan(ticketCount, compositorScale)[tileIndex]?.cssTop ?? 0;
}

export function assertTileFitsPhysical(cssHeight: number, displayScale: number): void {
  const physical = Math.round(cssHeight * displayScale);
  if (physical > MAX_PHYSICAL_SIDE) {
    console.warn(
      `[sdr-tiles] tile physical height ${physical}px exceeds ${MAX_PHYSICAL_SIDE}px cap`,
    );
  }
}

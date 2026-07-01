import { getTotalRows } from "@/types/ticket";
import {
  getLayoutRowGap,
  getLayoutRowHeight,
} from "@/lib/ticketGridLayout";
import {
  getMaxTileCssHeight,
  getResidentTileBudget,
  isConstrainedDevice,
  resolveMaxRowsPerTileForMemory,
  resolveMemoryBudgetedCompositorScale,
} from "@/lib/deviceMemoryBudget";

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

/**
 * Keep each tile's physical backing within the browser's max texture side, and
 * within the device's per-tile height budget (shorter on memory-constrained
 * devices so a single canvas can't exceed the per-canvas memory cap).
 */
export function resolveSdrTileMaxCssHeight(compositorScale: number): number {
  const scale = Math.max(1, compositorScale);
  const capFromPhysical = Math.floor(MAX_PHYSICAL_SIDE / scale);
  return Math.min(getMaxTileCssHeight(), capFromPhysical);
}

/** Max complete ticket rows per tile — never split a row across tiles. */
export function resolveMaxRowsPerTile(
  compositorScale: number,
  cssWidth = 0,
): number {
  const maxCss = resolveSdrTileMaxCssHeight(compositorScale);
  const rowHeight = getLayoutRowHeight();
  const rowGap = getLayoutRowGap();
  let maxRows = Math.max(1, Math.floor((maxCss + rowGap) / rowHeight));
  if (cssWidth > 0) {
    maxRows = Math.min(
      maxRows,
      resolveMaxRowsPerTileForMemory(cssWidth, compositorScale),
    );
  }
  return maxRows;
}

/** Compositor scale for tile planning — memory-capped when `cssWidth` is known. */
export function resolveSdrCompositorScaleForLayout(
  naturalScale: number,
  cssWidth: number,
): number {
  return resolveMemoryBudgetedCompositorScale(
    naturalScale,
    cssWidth,
    getMaxTileCssHeight(),
  );
}

export function getRowBandCssHeight(
  startRow: number,
  endRow: number,
  totalRows: number,
  rowHeight = getLayoutRowHeight(),
  rowGap = getLayoutRowGap(),
): number {
  if (endRow <= startRow) return 0;
  const rows = endRow - startRow;
  const height = rows * rowHeight;
  return endRow < totalRows ? height - rowGap : height;
}

export function buildSdrTilePlan(
  ticketCount: number,
  compositorScale: number,
  cssWidth = 0,
): SdrTilePlan[] {
  const scale =
    cssWidth > 0
      ? resolveSdrCompositorScaleForLayout(compositorScale, cssWidth)
      : compositorScale;
  const totalRows = getTotalRows(ticketCount);
  const rowHeight = getLayoutRowHeight();
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

  const maxRowsPerTile = resolveMaxRowsPerTile(scale, cssWidth);
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
      cssTop: startRow * rowHeight,
      cssHeight: getRowBandCssHeight(startRow, endRow, totalRows, rowHeight),
    });
  }

  return plans;
}

export function computeSdrTileCount(
  ticketCount: number,
  compositorScale: number,
  cssWidth = 0,
): number {
  return buildSdrTilePlan(ticketCount, compositorScale, cssWidth)[0]?.tileCount ?? 1;
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
  cssWidth = 0,
): number {
  return buildSdrTilePlan(ticketCount, compositorScale, cssWidth)[tileIndex]?.cssHeight ?? 0;
}

export function getSdrTileTopCss(
  tileIndex: number,
  ticketCount: number,
  compositorScale: number,
  cssWidth = 0,
): number {
  return buildSdrTilePlan(ticketCount, compositorScale, cssWidth)[tileIndex]?.cssTop ?? 0;
}

/** Inclusive-exclusive tile index range kept resident for virtualization. */
export type SdrTileWindow = { start: number; end: number };

/**
 * Window of tiles to keep resident: the tiles overlapping the viewport, expanded
 * symmetrically until the window holds up to `maxTiles`. When `maxTiles` covers
 * the whole grid the full range is returned (no virtualization).
 */
export function computeVisibleTileRange(
  scrollTop: number,
  viewportHeight: number,
  ticketCount: number,
  compositorScale: number,
  maxTiles: number,
  cssWidth = 0,
): SdrTileWindow {
  const plans = buildSdrTilePlan(ticketCount, compositorScale, cssWidth);
  const tileCount = plans[0]?.tileCount ?? 1;

  if (!Number.isFinite(maxTiles) || maxTiles >= tileCount) {
    return { start: 0, end: tileCount };
  }

  const viewTop = scrollTop;
  const viewBottom = scrollTop + viewportHeight;

  let first = tileCount;
  let last = -1;
  for (const plan of plans) {
    const top = plan.cssTop;
    const bottom = plan.cssTop + plan.cssHeight;
    if (bottom > viewTop && top < viewBottom) {
      if (plan.tileIndex < first) first = plan.tileIndex;
      if (plan.tileIndex > last) last = plan.tileIndex;
    }
  }
  if (last < 0) {
    first = 0;
    last = 0;
  }

  let start = first;
  let end = last + 1;
  const cap = Math.max(1, Math.floor(maxTiles));
  // Expand symmetrically (below first, then above) until we hit the cap.
  while (end - start < cap) {
    const canGrowBelow = start > 0;
    const canGrowAbove = end < tileCount;
    if (!canGrowBelow && !canGrowAbove) break;
    if (canGrowBelow) start -= 1;
    if (end - start >= cap) break;
    if (canGrowAbove) end += 1;
  }

  return { start, end };
}

function isResidentCanvasTile(canvas: HTMLCanvasElement | null | undefined): boolean {
  return (
    canvas !== null &&
    canvas !== undefined &&
    canvas.width > 1 &&
    canvas.height > 1 &&
    canvas.style.visibility !== "hidden"
  );
}

/** True when any tile overlapping the viewport is missing or released. */
export function viewportNeedsCanvasTiles(
  tileCanvases: readonly (HTMLCanvasElement | null)[],
  scrollTop: number,
  viewportHeight: number,
  ticketCount: number,
  compositorScale: number,
  cssWidth = 0,
): boolean {
  const plans = buildSdrTilePlan(ticketCount, compositorScale, cssWidth);
  const viewTop = scrollTop;
  const viewBottom = scrollTop + viewportHeight;

  for (const plan of plans) {
    const top = plan.cssTop;
    const bottom = plan.cssTop + plan.cssHeight;
    if (bottom <= viewTop || top >= viewBottom) continue;
    if (!isResidentCanvasTile(tileCanvases[plan.tileIndex])) return true;
  }
  return false;
}

/** Stable key for the resident tile window at the current scroll position. */
export function getScrollTileBandKey(
  scrollTop: number,
  viewportHeight: number,
  ticketCount: number,
  compositorScale: number,
  maxTiles: number,
  cssWidth = 0,
): number {
  const { start, end } = computeVisibleTileRange(
    scrollTop,
    viewportHeight,
    ticketCount,
    compositorScale,
    maxTiles,
    cssWidth,
  );
  return start * 65536 + end;
}

/** Keep every tile resident when the full grid fits the phone tab canvas budget at 2×. */
const MAX_CONSTRAINED_TAB_TILE_BYTES = 96 * 1024 * 1024;

export function resolveResidentTileBudgetForGrid(
  ticketCount: number,
  compositorScale: number,
  cssWidth: number,
): number {
  if (!isConstrainedDevice() || cssWidth <= 0 || ticketCount <= 0) {
    return getResidentTileBudget();
  }

  const plans = buildSdrTilePlan(ticketCount, compositorScale, cssWidth);
  const tileCount = plans[0]?.tileCount ?? 1;
  const scale = resolveSdrCompositorScaleForLayout(compositorScale, cssWidth);

  let totalBytes = 0;
  for (const plan of plans) {
    const w = Math.max(1, Math.round(cssWidth * scale));
    const h = Math.max(1, Math.round(plan.cssHeight * scale));
    totalBytes += w * h * 4;
  }

  if (totalBytes <= MAX_CONSTRAINED_TAB_TILE_BYTES) {
    return tileCount;
  }

  return Math.min(getResidentTileBudget(), tileCount);
}

export function assertTileFitsPhysical(cssHeight: number, displayScale: number): void {
  const physical = Math.round(cssHeight * displayScale);
  if (physical > MAX_PHYSICAL_SIDE) {
    console.warn(
      `[sdr-tiles] tile physical height ${physical}px exceeds ${MAX_PHYSICAL_SIDE}px cap`,
    );
  }
}

/**
 * Device-adaptive rendering budget.
 *
 * On memory-constrained devices (phones, low-RAM machines) the SDR tall-canvas
 * grid would blow past the per-canvas / per-tab memory caps — Safari iOS wipes
 * canvases beyond ~64MB each and kills tabs beyond a few hundred MB total. So on
 * those devices we (a) bound how many tall-canvas tiles stay resident, (b)
 * shorten each tile, and (c) cap compositor scale so a single backing store
 * stays under the per-canvas byte budget (tile count alone is not enough at
 * DPR×4 display scale).
 *
 * On roomy desktops the resident budget is effectively unlimited, which keeps
 * the original zero-paint-on-scroll model (all tiles resident, scrolling is pure
 * GPU compositing).
 */

import { getLayoutRowGap, getLayoutRowHeight } from "@/lib/ticketGridLayout";

/** Desktop default per-tile CSS height cap (matches the original constant). */
const DESKTOP_MAX_TILE_CSS_HEIGHT = 3600;
/** Constrained per-tile CSS height — upper bound before memory/physical caps. */
const CONSTRAINED_MAX_TILE_CSS_HEIGHT = 1400;
/** Visible tile ±buffer when the full grid exceeds the tab canvas byte budget. */
const CONSTRAINED_RESIDENT_TILES = 7;
/** Safari iOS resets canvases above ~64MB; keep headroom for allocator overhead. */
const MAX_TILE_BACKING_BYTES = 48 * 1024 * 1024;
/** Hybrid text sprites cached on constrained devices (≈ viewport DOM pool). */
const CONSTRAINED_TEXT_SPRITE_CACHE_MAX = 48;
/** Desktop / roomy devices — prefetch + scroll-repaint amortisation. */
const DESKTOP_TEXT_SPRITE_CACHE_MAX = 512;
/** Tile compositor + sprite output buffer ceiling (backing-store memory). */
export const CONSTRAINED_MAX_DISPLAY_SCALE = 4;
/** HQ text paint scale — intermediate only; output sprites stay at display scale. */
export const CONSTRAINED_MAX_PAINT_SCALE = 8;

function naturalPaintScale(dpr: number): number {
  if (dpr >= 2) return dpr * 4;
  return Math.max(dpr * 2, 8);
}

/** Paint scale target on phones — full HQ path without growing tile/sprite buffers. */
export const getConstrainedNaturalPaintScale = (dpr: number): number =>
  Math.min(naturalPaintScale(dpr), CONSTRAINED_MAX_PAINT_SCALE);

function detectConstrained(): boolean {
  if (typeof window === "undefined") return false;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const deviceMemoryGb = nav.deviceMemory; // undefined on Safari/iOS
  const dpr = window.devicePixelRatio || 1;
  const coarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  const smallScreen = minSide <= 820;

  const touchPhoneOrTablet = coarsePointer && smallScreen;
  const lowReportedMemory =
    typeof deviceMemoryGb === "number" && deviceMemoryGb <= 4;
  // High-DPR + small viewport is the classic phone OOM profile (covers iOS,
  // where deviceMemory is unavailable).
  const phoneProfile = smallScreen && dpr >= 2 && coarsePointer;

  return touchPhoneOrTablet || lowReportedMemory || phoneProfile;
}

let _autoConstrained = detectConstrained();
/** "auto" = follow detection; a number forces a resident-tile cap (testing). */
let _residentOverride: "auto" | number = "auto";

export const refreshDeviceBudget = (): void => {
  _autoConstrained = detectConstrained();
};

export const isConstrainedDevice = (): boolean => _autoConstrained;

/** Force a resident-tile cap, e.g. to simulate mobile on a desktop. */
export const setResidentTileOverride = (value: "auto" | number): void => {
  _residentOverride = value;
};

export const getResidentTileOverride = (): "auto" | number => _residentOverride;

/** Max tall-canvas tiles kept resident; Infinity = keep all (no virtualization). */
export const getResidentTileBudget = (): number => {
  if (_residentOverride !== "auto") return _residentOverride;
  return _autoConstrained
    ? CONSTRAINED_RESIDENT_TILES
    : Number.POSITIVE_INFINITY;
};

/** Per-tile CSS height cap — bounds a single canvas's byte size. Auto only. */
export const getMaxTileCssHeight = (): number =>
  _autoConstrained
    ? CONSTRAINED_MAX_TILE_CSS_HEIGHT
    : DESKTOP_MAX_TILE_CSS_HEIGHT;

/**
 * Cap compositor scale on constrained devices so one tall tile's backing store
 * stays under {@link MAX_TILE_BACKING_BYTES}. Without this, resident-tile
 * virtualization alone still allocates ~100MB+ per tile at DPR×4 scale.
 */
export const resolveMemoryBudgetedCompositorScale = (
  naturalScale: number,
  cssWidth: number,
  maxTileCssHeight = getMaxTileCssHeight(),
): number => {
  if (!_autoConstrained || cssWidth <= 0 || maxTileCssHeight <= 0) {
    return naturalScale;
  }

  const pixelArea = cssWidth * maxTileCssHeight * 4;
  const maxFromBytes = Math.sqrt(MAX_TILE_BACKING_BYTES / pixelArea);
  const maxPhysicalSide = 8192;
  const maxFromPhysical = Math.min(
    maxPhysicalSide / cssWidth,
    maxPhysicalSide / maxTileCssHeight,
  );

  return Math.max(1, Math.min(naturalScale, maxFromBytes, maxFromPhysical));
};

/** Max ticket rows per tile that fit the per-canvas byte budget at `scale`. */
export const resolveMaxRowsPerTileForMemory = (
  cssWidth: number,
  compositorScale: number,
): number => {
  if (!_autoConstrained || cssWidth <= 0 || compositorScale <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const maxCssArea =
    MAX_TILE_BACKING_BYTES / (4 * compositorScale * compositorScale);
  const maxCssHeight = maxCssArea / cssWidth;
  const rowHeight = getLayoutRowHeight();
  return Math.max(
    1,
    Math.floor((maxCssHeight + getLayoutRowGap()) / rowHeight),
  );
};

export const getHybridTextSpriteCacheMax = (): number =>
  _autoConstrained
    ? CONSTRAINED_TEXT_SPRITE_CACHE_MAX
    : DESKTOP_TEXT_SPRITE_CACHE_MAX;

/** Cap compositor / sprite output scale on phones — keeps tile backing stores small. */
export const capScaleForConstrainedDevice = (scale: number): number =>
  _autoConstrained ? Math.min(scale, CONSTRAINED_MAX_DISPLAY_SCALE) : scale;

/** Cap HQ intermediate paint scale — does not change tile or sprite buffer dimensions. */
export const capPaintScaleForConstrainedDevice = (scale: number): number =>
  _autoConstrained ? Math.min(scale, CONSTRAINED_MAX_PAINT_SCALE) : scale;

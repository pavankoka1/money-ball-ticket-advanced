/**
 * Device-adaptive rendering budget.
 *
 * On memory-constrained devices (phones, low-RAM machines) the SDR tall-canvas
 * grid would blow past the per-canvas / per-tab memory caps — Safari iOS wipes
 * canvases beyond ~64MB each and kills tabs beyond a few hundred MB total. So on
 * those devices we (a) bound how many tall-canvas tiles stay resident and (b)
 * shorten each tile so a single canvas can't exceed the per-canvas cap.
 *
 * On roomy desktops the resident budget is effectively unlimited, which keeps
 * the original zero-paint-on-scroll model (all tiles resident, scrolling is pure
 * GPU compositing).
 */

/** Desktop default per-tile CSS height cap (matches the original constant). */
const DESKTOP_MAX_TILE_CSS_HEIGHT = 3600;
/** Constrained per-tile CSS height — keeps one canvas well under iOS's ~64MB. */
const CONSTRAINED_MAX_TILE_CSS_HEIGHT = 1400;
/** Visible tile ±1 on constrained devices. */
const CONSTRAINED_RESIDENT_TILES = 3;

function detectConstrained(): boolean {
  if (typeof window === "undefined") return false;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const deviceMemoryGb = nav.deviceMemory; // undefined on Safari/iOS
  const dpr = window.devicePixelRatio || 1;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  const smallScreen = minSide > 0 && minSide <= 820;

  const touchPhoneOrTablet = coarsePointer && smallScreen;
  const lowReportedMemory = typeof deviceMemoryGb === "number" && deviceMemoryGb <= 4;
  // High-DPR + small viewport is the classic phone OOM profile (covers iOS,
  // where deviceMemory is unavailable).
  const phoneProfile = smallScreen && dpr >= 2;

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
  _autoConstrained ? CONSTRAINED_MAX_TILE_CSS_HEIGHT : DESKTOP_MAX_TILE_CSS_HEIGHT;

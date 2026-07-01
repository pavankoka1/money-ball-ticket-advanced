/**
 * User-controlled display (compositor) scale override.
 * Auto-initialises to the natural value derived from screen DPR so the
 * starting quality matches the original renderer. Reduced via the dropdown.
 * Affects both tile-canvas backing store size and sprite buffer size.
 */

import {
  capScaleForConstrainedDevice,
  CONSTRAINED_MAX_DISPLAY_SCALE,
  isConstrainedDevice,
} from "@/lib/deviceMemoryBudget";

function _naturalPaintScale(dpr: number): number {
  if (dpr >= 2) return dpr * 4;
  return Math.max(dpr * 2, 8);
}

function _naturalDisplayScale(dpr: number): number {
  if (dpr >= 2) return _naturalPaintScale(dpr);
  const cap = _naturalPaintScale(dpr);
  return Math.max(2, Math.min(Math.ceil(dpr * 2), cap));
}

const _nativeDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

let _displayScaleOverride: number = capScaleForConstrainedDevice(
  _naturalDisplayScale(_nativeDpr),
);

export const getDisplayScaleOverride = (): number =>
  capScaleForConstrainedDevice(_displayScaleOverride);

export const setDisplayScaleOverride = (scale: number): void => {
  _displayScaleOverride = scale;
};

/** Re-apply constrained ceiling after device-budget refresh or width change. */
export const syncDisplayScaleForDevice = (): void => {
  if (!isConstrainedDevice()) return;
  _displayScaleOverride = Math.min(
    _displayScaleOverride,
    CONSTRAINED_MAX_DISPLAY_SCALE,
  );
};

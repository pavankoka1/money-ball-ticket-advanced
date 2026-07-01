/**
 * User-controlled paint / render-scale override.
 * Auto-initialises to the natural value derived from screen DPR.
 * Affects the intermediate paint buffer for text sprites (8× → HQ downsample).
 * Chrome is painted at displayScale for sharp 5px corners. Does NOT change tile memory.
 * On phones displayScale stays 2× while paintScale can be 8× for HQ text downsample.
 */

import {
  capPaintScaleForConstrainedDevice,
  CONSTRAINED_MAX_PAINT_SCALE,
  getConstrainedNaturalPaintScale,
  isConstrainedDevice,
} from "@/lib/deviceMemoryBudget";

function _naturalPaintScale(dpr: number): number {
  if (dpr >= 2) return dpr * 4;
  return Math.max(dpr * 2, 8);
}

const _readNativeDpr = (): number =>
  typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

const _nativeDpr = _readNativeDpr();

let _paintScaleOverride: number =
  typeof window !== "undefined" && isConstrainedDevice()
    ? getConstrainedNaturalPaintScale(_nativeDpr)
    : _naturalPaintScale(_nativeDpr);

export const getPaintScaleOverride = (): number =>
  capPaintScaleForConstrainedDevice(_paintScaleOverride);

export const setPaintScaleOverride = (scale: number): void => {
  _paintScaleOverride = scale;
};

export const syncPaintScaleForDevice = (): void => {
  if (!isConstrainedDevice()) return;
  const dpr = _readNativeDpr();
  const target = getConstrainedNaturalPaintScale(dpr);
  if (_paintScaleOverride < target) {
    _paintScaleOverride = target;
  }
  _paintScaleOverride = Math.min(
    _paintScaleOverride,
    CONSTRAINED_MAX_PAINT_SCALE,
  );
};

/**
 * User-controlled paint / render-scale override.
 * Auto-initialises to the natural value derived from screen DPR.
 * Affects the intermediate chrome paint buffer (non-domMatched path only).
 * NOTE: at SDR (DPR < 2) the hybrid renderer uses domMatched sprites baked
 * at displayScale, so changing paintScale does NOT affect tile canvas memory.
 * It only matters at DPR >= 2 (HiDPI non-SDR path).
 */

function _naturalPaintScale(dpr: number): number {
  if (dpr >= 2) return dpr * 4;
  return Math.max(dpr * 2, 8);
}

const _nativeDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

let _paintScaleOverride: number = _naturalPaintScale(_nativeDpr);

export const getPaintScaleOverride = (): number => _paintScaleOverride;

export const setPaintScaleOverride = (scale: number): void => {
  _paintScaleOverride = scale;
};

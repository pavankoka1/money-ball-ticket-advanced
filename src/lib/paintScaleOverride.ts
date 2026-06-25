/**
 * User-controlled paint / render-scale override.
 * Auto-initialises to the natural value derived from screen DPR.
 * Affects the intermediate paint buffer for text sprites (8× → HQ downsample).
 * Chrome is painted at displayScale for sharp 5px corners. Does NOT change tile memory.
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

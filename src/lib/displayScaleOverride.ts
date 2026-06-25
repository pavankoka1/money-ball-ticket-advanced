/**
 * User-controlled display (compositor) scale override.
 * Auto-initialises to the natural value derived from screen DPR so the
 * starting quality matches the original renderer. Reduced via the dropdown.
 * Affects both tile-canvas backing store size and sprite buffer size.
 */

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

let _displayScaleOverride: number = _naturalDisplayScale(_nativeDpr);

export const getDisplayScaleOverride = (): number => _displayScaleOverride;

export const setDisplayScaleOverride = (scale: number): void => {
  _displayScaleOverride = scale;
};

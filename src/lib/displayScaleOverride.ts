/**
 * User-controlled display (compositor) scale override.
 * null = let the system derive it from DPR (default behaviour).
 * Affects both tile-canvas backing store size and sprite buffer size.
 */
let _displayScaleOverride: number | null = null;

export const getDisplayScaleOverride = (): number | null => _displayScaleOverride;

export const setDisplayScaleOverride = (scale: number | null): void => {
  _displayScaleOverride = scale;
};

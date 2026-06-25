/**
 * User-controlled paint / render-scale override.
 * null = let the system derive it from DPR (default behaviour).
 * Affects the intermediate chrome paint buffer (non-domMatched path)
 * and the HiDPI display buffer scale.
 */
let _paintScaleOverride: number | null = null;

export const getPaintScaleOverride = (): number | null => _paintScaleOverride;

export const setPaintScaleOverride = (scale: number | null): void => {
  _paintScaleOverride = scale;
};

/**
 * Adaptive canvas DPR for the tall-canvas hybrid path.
 *
 * The constraint is twofold:
 *   1. backing-buffer pixel dimension must fit under per-browser caps
 *      (iOS Safari modern: 8192 px / side; Firefox: 11180 px / side).
 *   2. memory should stay reasonable (kbytes per ticket, not megabytes).
 *
 * Strategy: target the highest DPR that keeps both `width` and `height`
 * backing-buffer dimensions ≤ MAX_BACKING_SIDE, capped at device DPR
 * (never upscale). For small lists this lands on full-quality DPR=2 (retina)
 * or 1; only large lists fall back to lower fidelity.
 */
const MAX_BACKING_SIDE = 8192;
const MIN_DPR_FLOOR = 0.5;

export function resolveHybridTallCanvasDpr(
  cssWidth: number,
  cssHeight: number,
): number {
  const device =
    typeof window === "undefined" ? 2 : window.devicePixelRatio || 1;

  if (cssWidth <= 0 || cssHeight <= 0) return device;

  const longest = Math.max(cssWidth, cssHeight);
  const fitDpr = MAX_BACKING_SIDE / longest;
  // Clamp [MIN_DPR_FLOOR, device]. We never upscale beyond device DPR.
  return Math.max(MIN_DPR_FLOOR, Math.min(device, fitDpr));
}

/** For UI display only — informational. */
export const HYBRID_TALL_CANVAS_DPR_INFO = {
  maxBackingSide: MAX_BACKING_SIDE,
  minDprFloor: MIN_DPR_FLOOR,
};

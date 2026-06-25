/**
 * User-controlled DPR override. Starts at the real screen DPR (window.devicePixelRatio)
 * so the default behaviour is identical to the original code.
 * Reduced via the DPR dropdown in ControlsSection to trade quality for memory.
 */
const _nativeDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

let _dprOverride: number = _nativeDpr;

export const getNativeDpr = (): number => _nativeDpr;
export const getDprOverride = (): number => _dprOverride;
export const setDprOverride = (dpr: number): void => {
  _dprOverride = dpr;
};

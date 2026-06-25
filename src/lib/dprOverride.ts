/**
 * User-controlled DPR override for extraction canvases.
 * Defaults to 1 to minimize canvas memory on all devices.
 * Set via the DPR dropdown in ControlsSection.
 */
let _dprOverride: number = 1;

export const getDprOverride = (): number => _dprOverride;

export const setDprOverride = (dpr: number): void => {
  _dprOverride = dpr;
};

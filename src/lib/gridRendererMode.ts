import { MOBILE_LAYOUT_MAX_WIDTH } from "@/lib/ticketGridLayout";
import { isConstrainedDevice } from "@/lib/deviceMemoryBudget";

/**
 * Canvas tiles on phones / touch tablets. DOM on roomy desktop browsers
 * (avoids Linux canvas text pixelation).
 */
export function isCanvasGridMode(cssWidth = 0): boolean {
  if (!isConstrainedDevice()) return false;
  if (cssWidth > 0 && cssWidth > MOBILE_LAYOUT_MAX_WIDTH) {
    // Landscape tablet — still canvas when constrained.
    return true;
  }
  return true;
}

export function isDomGridMode(cssWidth = 0): boolean {
  return !isCanvasGridMode(cssWidth);
}

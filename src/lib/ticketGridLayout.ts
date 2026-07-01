import { TICKET_DESIGN_HEIGHT } from "@/lib/ticketDesign";
import {
  TICKET_MOBILE_DESIGN_WIDTH,
} from "@/lib/ticketDesign";
import {
  DESKTOP_CATALOG_MAX_WIDTH,
  DESKTOP_ROW_GAP,
} from "@/lib/catalogLayout";
import { isConstrainedDevice } from "@/lib/deviceMemoryBudget";

/** Desktop catalog — 5 tickets per row at full 1001px width. */
export const DESKTOP_TICKETS_PER_ROW = 5;
export { DESKTOP_ROW_GAP } from "@/lib/catalogLayout";

/** Breakpoint: below this drawable width, use mobile layout rules. */
export const MOBILE_LAYOUT_MAX_WIDTH = 640;

/** Horizontal + vertical gap between tickets on mobile. */
export const MOBILE_ROW_GAP = 4;

let _columns = DESKTOP_TICKETS_PER_ROW;
let _mobileLayout =
  typeof window !== "undefined" ? isConstrainedDevice() : false;
let _lastCssWidth = DESKTOP_CATALOG_MAX_WIDTH;

export function getLastLayoutCssWidth(): number {
  return _lastCssWidth;
}

/** Live mobile layout check — do not rely on stale `_mobileLayout` alone. */
export function resolveIsMobileTicketLayout(cssWidth: number): boolean {
  return isConstrainedDevice() || cssWidth <= MOBILE_LAYOUT_MAX_WIDTH;
}

export function isMobileTicketLayout(): boolean {
  return _mobileLayout;
}

export function getTicketGridColumns(): number {
  return _columns;
}

export function getLayoutRowGap(): number {
  return _mobileLayout ? MOBILE_ROW_GAP : DESKTOP_ROW_GAP;
}

export function getLayoutRowHeight(): number {
  return TICKET_DESIGN_HEIGHT + getLayoutRowGap();
}

/** Min drawable width for two 181px tickets + 4px gap. */
export function getMobileTwoColumnMinWidth(): number {
  return 2 * TICKET_MOBILE_DESIGN_WIDTH + MOBILE_ROW_GAP;
}

function resolveMobileColumns(cssWidth: number): number {
  return cssWidth >= getMobileTwoColumnMinWidth() ? 2 : 1;
}

function resolveDesktopColumns(_cssWidth: number): number {
  return DESKTOP_TICKETS_PER_ROW;
}

/**
 * Resolve column count from parent drawable width.
 * Mobile: 1 or 2 × 181px tickets (4px gap), horizontally centred.
 * Desktop: up to 5 × 197px tickets (4px gap), centred in ≤1001px.
 */
export function resolveTicketGridColumns(
  cssWidth: number,
  constrained = isConstrainedDevice(),
): number {
  if (constrained || cssWidth <= MOBILE_LAYOUT_MAX_WIDTH) {
    return resolveMobileColumns(cssWidth);
  }
  return resolveDesktopColumns(cssWidth);
}

export function setTicketGridLayout(cssWidth: number): void {
  _lastCssWidth = cssWidth;
  _mobileLayout = resolveIsMobileTicketLayout(cssWidth);
  _columns = resolveTicketGridColumns(cssWidth);
}

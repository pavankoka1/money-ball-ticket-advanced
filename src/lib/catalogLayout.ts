import { TICKET_DESIGN_HEIGHT } from "@/lib/ticketDesign";
import {
  MOBILE_ROW_GAP,
  resolveIsMobileTicketLayout,
} from "@/lib/ticketGridLayout";

/** Figma desktop catalog strip — 5 × 197px tickets + 4 × 4px gaps. */
export const DESKTOP_CATALOG_MAX_WIDTH = 1001;
export const DESKTOP_CATALOG_VIEWPORT_HEIGHT = 231;
export const DESKTOP_ROW_GAP = 4;

/** Visible ticket rows in the scroll viewport. */
export const MOBILE_VIEWPORT_ROWS = 4;
export const DESKTOP_VIEWPORT_ROWS = 5;

export function getCatalogViewportHeight(cssWidth: number): number {
  if (resolveIsMobileTicketLayout(cssWidth)) {
    return (
      MOBILE_VIEWPORT_ROWS * TICKET_DESIGN_HEIGHT +
      (MOBILE_VIEWPORT_ROWS - 1) * MOBILE_ROW_GAP
    );
  }
  return DESKTOP_CATALOG_VIEWPORT_HEIGHT;
}

export function getCatalogViewportRows(cssWidth: number): number {
  return resolveIsMobileTicketLayout(cssWidth)
    ? MOBILE_VIEWPORT_ROWS
    : DESKTOP_VIEWPORT_ROWS;
}

/** Layout/content width for the ticket grid (fixed strip on desktop). */
export function getCatalogLayoutWidth(cssWidth: number): number {
  if (resolveIsMobileTicketLayout(cssWidth)) return cssWidth;
  return DESKTOP_CATALOG_MAX_WIDTH;
}

/** Clamp drawable catalog width to the design maximum on desktop. */
export function clampCatalogCssWidth(cssWidth: number): number {
  return getCatalogLayoutWidth(cssWidth);
}

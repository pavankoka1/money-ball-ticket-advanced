import { TICKET_DESIGN_HEIGHT } from "@/lib/ticketDesign";
import {
  getTicketGridColumns,
  getLayoutRowGap,
} from "@/lib/ticketGridLayout";
import {
  DESKTOP_ROW_GAP,
  getCatalogViewportHeight,
  MOBILE_VIEWPORT_ROWS,
} from "@/lib/catalogLayout";

export type TicketCell =
  | { type: "number"; value: number }
  | { type: "crown"; value: number };

export type Ticket = {
  id: number;
  cells: TicketCell[];
  isWinning: boolean;
  stake?: string;
};

export const TICKETS_PER_ROW = 5;
export const TICKET_HEIGHT = TICKET_DESIGN_HEIGHT;
export const ROW_GAP = 12;
export const GRID_PADDING = 8;
export const ROW_HEIGHT = TICKET_HEIGHT + ROW_GAP;
/** @deprecated Use getCatalogViewportHeight(width) — default mobile band for legacy imports. */
export const VIEWPORT_ROWS = MOBILE_VIEWPORT_ROWS;
export const VIEWPORT_HEIGHT =
  MOBILE_VIEWPORT_ROWS * TICKET_HEIGHT +
  (MOBILE_VIEWPORT_ROWS - 1) * DESKTOP_ROW_GAP;

export { getCatalogViewportHeight };
export const MAX_TICKETS = 1000;

export const BUNDLES = [
  { count: 1, price: "R$1.00", theme: "green" as const },
  { count: 5, price: "R$5.00", theme: "blue" as const },
  { count: 25, price: "R$25.00", theme: "magenta" as const },
  { count: 100, price: "R$100.00", theme: "gold" as const },
] as const;

/** @deprecated Use BUNDLES */
export const ADD_BUNDLES = BUNDLES.map((b) => b.count);

export function getTotalRows(ticketCount: number, columns = getTicketGridColumns()) {
  return Math.ceil(ticketCount / columns);
}

export function getContentHeight(ticketCount: number, columns = getTicketGridColumns()) {
  const rows = getTotalRows(ticketCount, columns);
  if (rows === 0) return 0;
  const gap = getLayoutRowGap();
  return rows * TICKET_HEIGHT + (rows - 1) * gap;
}

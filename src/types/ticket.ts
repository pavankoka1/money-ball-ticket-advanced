import { TICKET_DESIGN_HEIGHT } from "@/lib/ticketDesign";

export type TicketCell =
  | { type: "number"; value: number }
  | { type: "crown"; value: number };

export type Ticket = {
  id: number;
  cells: TicketCell[];
  isWinning: boolean;
  stake?: string;
};

export const TICKETS_PER_ROW = 4;
export const TICKET_HEIGHT = TICKET_DESIGN_HEIGHT;
export const ROW_GAP = 12;
export const GRID_PADDING = 8;
export const ROW_HEIGHT = TICKET_HEIGHT + ROW_GAP;
export const VIEWPORT_ROWS = 3;
export const VIEWPORT_HEIGHT =
  VIEWPORT_ROWS * TICKET_HEIGHT + (VIEWPORT_ROWS - 1) * ROW_GAP;
export const MAX_TICKETS = 1000;

export const BUNDLES = [
  { count: 1, price: "R$1.00", theme: "green" as const },
  { count: 5, price: "R$5.00", theme: "blue" as const },
  { count: 25, price: "R$25.00", theme: "magenta" as const },
  { count: 100, price: "R$100.00", theme: "gold" as const },
] as const;

/** @deprecated Use BUNDLES */
export const ADD_BUNDLES = BUNDLES.map((b) => b.count);

export function getTotalRows(ticketCount: number) {
  return Math.ceil(ticketCount / TICKETS_PER_ROW);
}

export function getContentHeight(ticketCount: number) {
  const rows = getTotalRows(ticketCount);
  if (rows === 0) return 0;
  return rows * TICKET_HEIGHT + (rows - 1) * ROW_GAP;
}

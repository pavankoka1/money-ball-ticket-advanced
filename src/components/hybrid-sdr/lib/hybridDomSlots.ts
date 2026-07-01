import type { TicketSlot } from "@/lib/ticketLayout";
import { getTicketGridColumns } from "@/lib/ticketGridLayout";
import { getLayoutRowHeight } from "@/lib/ticketGridLayout";
import { TICKET_HEIGHT, type Ticket } from "@/types/ticket";

/** Wait this long after the last scroll event before treating scroll as idle. */
export const HYBRID_SCROLL_IDLE_MS = 300;

/**
 * Extra rows above + below the viewport kept in the DOM pool band.
 * ±4 rows → 11 row band × 4 cols = 44 pool slots; cards scroll natively in
 * content space so the crisp band covers slow scrolls without per-frame JS.
 */
export const HYBRID_DOM_ROW_BUFFER = 4;

/**
 * Tall-canvas mode: DOM tickets are positioned in CONTENT-coordinate space,
 * so the in/out test only needs `slot.y` and the visible content window.
 */
export function isSlotInVisibleWindow(
  slotY: number,
  scrollTop: number,
  viewportHeight: number,
  bufferRows = HYBRID_DOM_ROW_BUFFER,
): boolean {
  const margin = bufferRows * getLayoutRowHeight();
  const windowTop = scrollTop - margin;
  const windowBottom = scrollTop + viewportHeight + margin;
  return slotY + TICKET_HEIGHT > windowTop && slotY < windowBottom;
}

/**
 * Visible layout slots for the DOM pool band — O(1) slice; layout is row-major.
 */
export function getVisibleDomSlots(
  slots: readonly TicketSlot[],
  scrollTop: number,
  viewportHeight: number,
  bufferRows = HYBRID_DOM_ROW_BUFFER,
): TicketSlot[] {
  const { startRow, endRow } = getViewportRowRange(
    scrollTop,
    viewportHeight,
    bufferRows,
  );
  const columns = getTicketGridColumns();
  const startIndex = startRow * columns;
  const endIndex = Math.min(slots.length, endRow * columns);
  if (startIndex >= endIndex) return [];
  return slots.slice(startIndex, endIndex);
}

export function getVisibleDomSlotIdSet(slots: readonly TicketSlot[]): Set<number> {
  return new Set(slots.map((slot) => slot.id));
}

export function getViewportRowRange(
  scrollTop: number,
  viewportHeight: number,
  bufferRows = HYBRID_DOM_ROW_BUFFER,
): { startRow: number; endRow: number } {
  const margin = bufferRows * getLayoutRowHeight();
  const top = Math.max(0, scrollTop - margin);
  const bottom = scrollTop + viewportHeight + margin;
  const rowH = getLayoutRowHeight();
  const startRow = Math.max(0, Math.floor(top / rowH));
  const endRow = Math.max(startRow + 1, Math.ceil(bottom / rowH));
  return { startRow, endRow };
}

/** Stable key for the DOM pool row band — only changes when the buffered slice shifts. */
export function getDomScrollBandKey(
  scrollTop: number,
  viewportHeight: number,
  bufferRows = HYBRID_DOM_ROW_BUFFER,
): number {
  const { startRow, endRow } = getViewportRowRange(
    scrollTop,
    viewportHeight,
    bufferRows,
  );
  return startRow * 65536 + endRow;
}

export function getTicketsInRowRange(
  layout: readonly TicketSlot[],
  tickets: readonly Ticket[],
  startRow: number,
  endRow: number,
): Ticket[] {
  const out: Ticket[] = [];
  const seen = new Set<number>();
  for (const slot of layout) {
    const row = Math.floor(slot.y / getLayoutRowHeight());
    if (row < startRow || row >= endRow) continue;
    const ticket = tickets[slot.index];
    if (!ticket || seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    out.push(ticket);
  }
  return out;
}

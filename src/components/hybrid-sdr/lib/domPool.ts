import { TICKET_CELL_COUNT } from "@/lib/ticketDesign";
import type { TicketSlot } from "@/lib/ticketLayout";
import { TICKETS_PER_ROW, VIEWPORT_ROWS, type Ticket } from "@/types/ticket";
import { HYBRID_DOM_ROW_BUFFER } from "./hybridDomSlots";

/** Cards mounted per RAF on first pool warm-up (keeps each frame under long-task budget). */
export const DOM_POOL_MOUNT_BATCH_SIZE = 4;

/**
 * Fixed pool — viewport rows + ±buffer rows above and below.
 * At buffer=4: (3 + 8) × 4 = 44 slots (~400 DOM nodes at ~9 nodes/card).
 */
export const HYBRID_DOM_OVERLAY_POOL_SIZE =
  TICKETS_PER_ROW * (VIEWPORT_ROWS + 2 * HYBRID_DOM_ROW_BUFFER);

export type DomPoolEntry = {
  ticket: Ticket;
  x: number;
  y: number;
  cardWidth: number;
  active: boolean;
};

export type DomPoolUpdateResult = {
  activeCount: number;
  changed: boolean;
};

export const DOM_POOL_PLACEHOLDER: Ticket = {
  id: -1,
  cells: Array.from({ length: TICKET_CELL_COUNT }, () => ({
    type: "number" as const,
    value: 0,
  })),
  isWinning: false,
};

export function createInitialDomPoolEntries(): DomPoolEntry[] {
  return Array.from({ length: HYBRID_DOM_OVERLAY_POOL_SIZE }, () => ({
    ticket: DOM_POOL_PLACEHOLDER,
    x: 0,
    y: 0,
    cardWidth: 0,
    active: false,
  }));
}

function entryMatchesSlot(
  entry: DomPoolEntry,
  ticket: Ticket,
  x: number,
  y: number,
  cardWidth: number,
): boolean {
  return (
    entry.active &&
    entry.ticket === ticket &&
    entry.x === x &&
    entry.y === y &&
    entry.cardWidth === cardWidth
  );
}

/** Mutates `entries` in place — no new entry objects or maps. */
export function updateDomPoolEntriesInPlace(
  entries: DomPoolEntry[],
  slots: readonly TicketSlot[],
  ticketsById: ReadonlyMap<number, Ticket>,
): DomPoolUpdateResult {
  let activeCount = 0;
  let changed = false;

  for (let i = 0; i < HYBRID_DOM_OVERLAY_POOL_SIZE; i++) {
    const entry = entries[i];
    const slot = slots[i];

    if (!slot) {
      if (entry.active) changed = true;
      entry.active = false;
      continue;
    }

    const ticket = ticketsById.get(slot.id);
    if (!ticket) {
      if (entry.active) changed = true;
      entry.active = false;
      continue;
    }

    const x = Math.round(slot.x);
    const y = Math.round(slot.y);
    const cardWidth = slot.cardWidth;

    if (entryMatchesSlot(entry, ticket, x, y, cardWidth)) {
      activeCount++;
      continue;
    }

    changed = true;
    entry.ticket = ticket;
    entry.x = x;
    entry.y = y;
    entry.cardWidth = cardWidth;
    entry.active = true;
    activeCount++;
  }

  return { activeCount, changed };
}

export function countActiveDomPoolEntries(entries: readonly DomPoolEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.active) count++;
  }
  return count;
}

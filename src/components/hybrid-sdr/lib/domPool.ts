import { TICKET_CELL_COUNT } from "@/lib/ticketDesign";
import type { TicketSlot } from "@/lib/ticketLayout";
import { getCatalogViewportRows } from "@/lib/catalogLayout";
import {
  getTicketGridColumns,
  getLastLayoutCssWidth,
  DESKTOP_TICKETS_PER_ROW,
} from "@/lib/ticketGridLayout";
import type { Ticket } from "@/types/ticket";
import { HYBRID_DOM_ROW_BUFFER } from "./hybridDomSlots";

/** Cards mounted per RAF on first pool warm-up (keeps each frame under long-task budget). */
export const DOM_POOL_MOUNT_BATCH_SIZE = 4;

function resolvePoolViewportRows(): number {
  return getCatalogViewportRows(getLastLayoutCssWidth()) + 2 * HYBRID_DOM_ROW_BUFFER;
}

/**
 * Fixed pool — viewport rows + ±buffer rows above and below.
 */
export const HYBRID_DOM_OVERLAY_POOL_SIZE =
  DESKTOP_TICKETS_PER_ROW * resolvePoolViewportRows();

export function getActiveDomPoolSlotCount(): number {
  return getTicketGridColumns() * resolvePoolViewportRows();
}

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
  changedIndices: number[];
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
  const changedIndices: number[] = [];

  const poolSize = getActiveDomPoolSlotCount();

  for (let i = 0; i < poolSize; i++) {
    const entry = entries[i];
    const slot = slots[i];

    if (!slot) {
      if (entry.active) {
        changed = true;
        changedIndices.push(i);
      }
      entry.active = false;
      continue;
    }

    const ticket = ticketsById.get(slot.id);
    if (!ticket) {
      if (entry.active) {
        changed = true;
        changedIndices.push(i);
      }
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
    changedIndices.push(i);
    entry.ticket = ticket;
    entry.x = x;
    entry.y = y;
    entry.cardWidth = cardWidth;
    entry.active = true;
    activeCount++;
  }

  for (let i = poolSize; i < HYBRID_DOM_OVERLAY_POOL_SIZE; i++) {
    const entry = entries[i];
    if (!entry.active) continue;
    changed = true;
    changedIndices.push(i);
    entry.active = false;
  }

  return { activeCount, changed, changedIndices };
}

export function countActiveDomPoolEntries(entries: readonly DomPoolEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.active) count++;
  }
  return count;
}

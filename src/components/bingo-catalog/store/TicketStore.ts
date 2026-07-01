import type { Ticket } from "@/types/ticket";
import { EventBus } from "../lib/EventBus";
import { mergeTicketUpdate } from "../lib/mergeTicketUpdate";

export type CatalogTicketUpdate = {
  index?: number;
  cellValues?: number[];
  cellIsCrown?: boolean[];
  isWinning?: boolean;
  hitIndices?: number[];
};

type StoredTicket = {
  ticket: Ticket;
  update?: CatalogTicketUpdate;
};

class TicketStoreClass extends EventBus {
  private eventQueue: [string, unknown[]][] = [];
  private eventReady = false;
  private tickets: Record<number, StoredTicket> = {};
  private lastChanges: Record<number, CatalogTicketUpdate> = {};
  private ticketCount = 0;
  private sortedIds: number[] = [];

  getTicketUpdate(
    id: number,
    withLast: boolean,
  ): [CatalogTicketUpdate, CatalogTicketUpdate] | undefined {
    const entry = this.tickets[id]?.update;
    if (!entry) return undefined;
    this.tickets[id].update = undefined;
    return [entry, (withLast && this.lastChanges[id]) || {}];
  }

  processQueue(): void {
    this.eventReady = true;
    let event: [string, unknown[]] | undefined;
    while ((event = this.eventQueue.shift())) {
      super.dispatchEvent(event[0], ...event[1]);
    }
  }

  stopQueue(): void {
    this.eventReady = false;
  }

  getTicketCount(): number {
    return this.ticketCount;
  }

  getSortedIds(): readonly number[] {
    return this.sortedIds;
  }

  getTicketById(id: number): Ticket | undefined {
    return this.tickets[id]?.ticket;
  }

  addTickets(newTickets: Ticket[], replace = false): void {
    const ids = newTickets.map((t) => t.id);

    if (replace) {
      this.ticketCount = newTickets.length;
      this.sortedIds = [...ids];
      this.tickets = {};
    } else {
      this.ticketCount += newTickets.length;
      this.sortedIds = [...ids, ...this.sortedIds];

      newTickets.forEach((ticket, index) => {
        this.tickets[ticket.id] = {
          ticket,
          update: {
            index,
            cellValues: ticket.cells.map((c) => c.value),
            cellIsCrown: ticket.cells.map((c) => c.type === "crown"),
            isWinning: ticket.isWinning,
          },
        };
      });
    }

    if (replace) {
      newTickets.forEach((ticket, index) => {
        this.tickets[ticket.id] = {
          ticket,
          update: {
            index,
            cellValues: ticket.cells.map((c) => c.value),
            cellIsCrown: ticket.cells.map((c) => c.type === "crown"),
            isWinning: ticket.isWinning,
          },
        };
      });
    }

    this.dispatchEvent("add", ids, replace);
    this.dispatchEvent("count", this.ticketCount);
  }

  removeTickets(ids: number[]): void {
    this.ticketCount -= ids.length;
    this.dispatchEvent("count", this.ticketCount);
    ids.forEach((id) => delete this.tickets[id]);
    this.sortedIds = this.sortedIds.filter((ticketId) => !ids.includes(ticketId));
    this.dispatchEvent("remove", ids);
  }

  sortTickets(ticketIds: number[]): void {
    this.sortedIds = [...ticketIds];
    this.dispatchEvent("sort", ticketIds);
  }

  /** Replace full catalog order + ticket data (hybrid grid after reorder). */
  replaceTickets(orderedTickets: Ticket[]): void {
    const ids = orderedTickets.map((t) => t.id);
    this.ticketCount = orderedTickets.length;
    this.sortedIds = [...ids];
    this.tickets = {};
    orderedTickets.forEach((ticket, index) => {
      this.tickets[ticket.id] = {
        ticket,
        update: {
          index,
          cellValues: ticket.cells.map((c) => c.value),
          cellIsCrown: ticket.cells.map((c) => c.type === "crown"),
          isWinning: ticket.isWinning,
        },
      };
    });
    this.dispatchEvent("replace", ids);
    this.dispatchEvent("count", this.ticketCount);
  }

  updateTickets(updates: { id: number; changes: CatalogTicketUpdate }[]): void {
    this.lastChanges = {};

    const ids = updates.map(({ id, changes }) => {
      const stored = this.tickets[id];
      if (!stored) return id;

      if (stored.update) {
        mergeTicketUpdate(stored.update, changes);
      } else {
        stored.update = { ...changes };
      }

      this.lastChanges[id] = changes;
      return id;
    });

    this.dispatchEvent("update", ids);
  }

  reset(): void {
    this.tickets = {};
    this.sortedIds = [];
    this.ticketCount = 0;
    this.lastChanges = {};
    this.dispatchEvent("reset");
    this.dispatchEvent("count", 0);
  }

  dispatchEvent(event: string, ...args: unknown[]): void {
    if (!this.eventReady) {
      this.eventQueue.push([event, args]);
      return;
    }
    super.dispatchEvent(event, ...args);
  }
}

export const TicketStore = new TicketStoreClass();

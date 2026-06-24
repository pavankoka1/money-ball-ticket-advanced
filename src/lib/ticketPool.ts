import type { Ticket, TicketCell } from "@/types/ticket";
import { MAX_TICKETS } from "@/types/ticket";

type TicketTemplate = {
  cells: TicketCell[];
  isWinning: boolean;
  stake?: string;
};

/** Deterministic LCG — stable pool across sessions so idle sprite warm hits real fingerprints. */
function seededInt(seed: number, min: number, max: number): number {
  const next = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
  return min + (next % (max - min + 1));
}

function formatStake(amount: number) {
  return `R$${amount.toFixed(2).replace(".", ",")}`;
}

function buildTemplate(seed: number): TicketTemplate {
  const isWinning = seed % 9 === 0;
  const cells: TicketCell[] = Array.from({ length: 6 }, (_, cellIndex) => {
    const value = seededInt(seed * 31 + cellIndex * 7, 1, 30);
    if (isWinning && seededInt(seed + cellIndex, 0, 2) === 0) {
      return { type: "crown", value };
    }
    return { type: "number", value };
  });

  return {
    cells,
    isWinning,
    stake: isWinning ? formatStake(seededInt(seed, 120, 980) / 10) : undefined,
  };
}

const POOL: readonly TicketTemplate[] = Array.from(
  { length: MAX_TICKETS },
  (_, index) => buildTemplate(index + 1),
);

let poolCursor = 0;

export function resetTicketPool(): void {
  poolCursor = 0;
}

/** O(1) ticket claim — no main-thread random work on bundle click (bingo-ticket-poc pattern). */
export function claimTicketsFromPool(count: number, startId: number): Ticket[] {
  const tickets: Ticket[] = [];
  for (let i = 0; i < count; i++) {
    const template = POOL[poolCursor % POOL.length];
    poolCursor += 1;
    tickets.push({
      id: startId + i,
      cells: template.cells.map((cell) => ({ ...cell })),
      isWinning: template.isWinning,
      stake: template.stake,
    });
  }
  return tickets;
}

/** First N pool entries as tickets — used to warm text sprite cache on idle. */
export function getPoolTicketsForWarm(count: number): Ticket[] {
  const limit = Math.min(count, POOL.length);
  return Array.from({ length: limit }, (_, index) => {
    const template = POOL[index];
    return {
      id: index + 1,
      cells: template.cells.map((cell) => ({ ...cell })),
      isWinning: template.isWinning,
      stake: template.stake,
    };
  });
}

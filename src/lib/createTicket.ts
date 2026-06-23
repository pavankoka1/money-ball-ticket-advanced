import type { Ticket, TicketCell } from "@/types/ticket";

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatStake(amount: number) {
  return `R$${amount.toFixed(2).replace(".", ",")}`;
}

export function createTicket(id: number): Ticket {
  const isWinning = Math.random() < 0.12;
  const cells: TicketCell[] = Array.from({ length: 6 }, () => {
    const value = randomInt(1, 30);
    if (isWinning && Math.random() < 0.35) {
      return { type: "crown", value };
    }
    return { type: "number", value };
  });

  return {
    id,
    cells,
    isWinning,
    stake: isWinning ? formatStake(randomInt(120, 980) / 10) : undefined,
  };
}

export function createTickets(fromId: number, count: number): Ticket[] {
  return Array.from({ length: count }, (_, i) => createTicket(fromId + i));
}

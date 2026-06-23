import type { Ticket } from "@/types/ticket";
import type { ReorderTransition } from "@/lib/ticketLayout";

export type WorkerRequest =
  | {
      type: "compute-reorder";
      requestId: number;
      prevTickets: Ticket[];
      removedBall: number;
      cssWidth: number;
    }
  | {
      type: "compute-shuffle";
      requestId: number;
      prevTickets: Ticket[];
      cssWidth: number;
    };

export type WorkerResponse = {
  type: "reorder-result";
  requestId: number;
  nextTickets: Ticket[];
  transitions: ReorderTransition[];
};

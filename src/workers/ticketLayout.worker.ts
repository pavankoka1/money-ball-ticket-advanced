import {
  buildHybridLayoutConfig,
  computeReorderTransitions,
  shuffleTickets,
  sortTicketsAfterBallRemoval,
} from "@/lib/ticketLayout";
import type {
  WorkerRequest,
  WorkerResponse,
} from "@/workers/ticketLayout.worker.types";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  const layoutConfig = buildHybridLayoutConfig(msg.cssWidth);

  const nextTickets =
    msg.type === "compute-shuffle"
      ? shuffleTickets(msg.prevTickets)
      : sortTicketsAfterBallRemoval(msg.prevTickets, msg.removedBall);

  const transitions = computeReorderTransitions(
    msg.prevTickets,
    nextTickets,
    layoutConfig,
  );

  const response: WorkerResponse = {
    type: "reorder-result",
    requestId: msg.requestId,
    nextTickets,
    transitions,
  };

  self.postMessage(response);
};

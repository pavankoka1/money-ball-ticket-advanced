import { CATALOG_CONFIG } from "../lib/catalogConfig";
import type { CatalogTicket } from "../ticket/CatalogTicket";
import {
  buildTicketAddFlowKeyframes,
  TICKET_ADD_ANIM,
} from "@/lib/ticketAddAnimation";

export type ContainerAttrs = {
  columns: number;
  visibleTicketsCount: number;
};

export function calculateContainerAttributes(): ContainerAttrs {
  return {
    columns: CATALOG_CONFIG.COLUMNS,
    visibleTicketsCount: CATALOG_CONFIG.VISIBLE_TICKETS_COUNT,
  };
}

function calculateCenteringOffset(columns: number, ticketCount: number): number {
  const remainder = ticketCount % columns;
  return remainder ? (columns - remainder) / 2 : 0;
}

function calculateDeltas(
  prevIndex: number,
  newIndex: number,
  columns: number,
  offset: number,
  lastRowIndex: number,
): { deltaX: number; deltaY: number } {
  const fromRow = (prevIndex / columns) | 0;
  const toRow = (newIndex / columns) | 0;
  const fromCol = (prevIndex % columns) + (fromRow === lastRowIndex ? offset : 0);
  const toCol = (newIndex % columns) + (toRow === lastRowIndex ? offset : 0);

  return { deltaX: (fromCol - toCol) * 100, deltaY: (fromRow - toRow) * 100 };
}

function createShuffleAnimation(
  element: HTMLElement,
  deltaX: number,
  deltaY: number,
): Animation {
  return element.animate(
    [
      { transform: `translate(${deltaX}%, ${deltaY}%)` },
      { transform: "translate(0, 0)" },
    ],
    {
      duration: CATALOG_CONFIG.ANIMATION.SHUFFLE_DURATION,
      easing: "ease-in-out",
      fill: "both",
    },
  );
}

export function shuffleAnimation(
  container: HTMLElement,
  containerAttrs: ContainerAttrs,
  prevTicketOrder: readonly number[],
  newTicketOrder: readonly number[],
  tickets: Record<number, CatalogTicket>,
): void {
  const ticketCount = prevTicketOrder.length;
  const columns = containerAttrs.columns;
  const lastRowIndex = ((ticketCount - 1) / columns) | 0;
  const offset = calculateCenteringOffset(columns, ticketCount);
  const visibleTickets = containerAttrs.visibleTicketsCount;

  const prevVisibleTickets = prevTicketOrder.slice(0, visibleTickets);
  const newVisibleTickets = newTicketOrder.slice(0, visibleTickets);
  const ticketsToAnimate = new Set([...prevVisibleTickets, ...newVisibleTickets]);

  const animations = Array.from(ticketsToAnimate).map((ticketId) => {
    const prevIndex = prevTicketOrder.indexOf(ticketId);
    const newIndex = newTicketOrder.indexOf(ticketId);
    if (prevIndex === newIndex) return null;

    const { deltaX, deltaY } = calculateDeltas(
      prevIndex,
      newIndex,
      columns,
      offset,
      lastRowIndex,
    );
    return createShuffleAnimation(tickets[ticketId].dom, deltaX, deltaY);
  });

  const sortedDom = newTicketOrder.map((id) => tickets[id].dom);
  container.append(...sortedDom);
  requestAnimationFrame(() => animations.forEach((animation) => animation?.play()));
}

export function shuffleAnimationDelayed(
  container: HTMLElement,
  containerAttrs: ContainerAttrs,
  prevTicketOrder: readonly number[],
  newTicketOrder: readonly number[],
  tickets: Record<number, CatalogTicket>,
): void {
  setTimeout(
    () =>
      shuffleAnimation(
        container,
        containerAttrs,
        prevTicketOrder,
        newTicketOrder,
        tickets,
      ),
    CATALOG_CONFIG.ANIMATION.SHUFFLE_DELAY_MS,
  );
}

export function fadeInAnimation(element: HTMLElement, delayMs = 0): void {
  element.style.transformOrigin = TICKET_ADD_ANIM.TRANSFORM_ORIGIN;
  element.style.opacity = "0";
  element.style.transform = `scale(${TICKET_ADD_ANIM.SCALE_OVERSHOOT})`;

  const animation = element.animate(buildTicketAddFlowKeyframes(), {
    duration: TICKET_ADD_ANIM.DURATION_MS,
    delay: delayMs,
    easing: TICKET_ADD_ANIM.EASING,
    fill: "both",
  });

  animation.addEventListener(
    "finish",
    () => {
      element.style.opacity = "1";
      element.style.transformOrigin = "";
      element.style.transform = "";
    },
    { once: true },
  );
}

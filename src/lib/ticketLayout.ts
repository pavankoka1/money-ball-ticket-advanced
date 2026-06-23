import type { Ticket } from "@/types/ticket";
import {
  GRID_PADDING,
  ROW_GAP,
  ROW_HEIGHT,
  TICKETS_PER_ROW,
  TICKET_HEIGHT,
  getContentHeight,
} from "@/types/ticket";
import { TICKET_DESIGN_WIDTH } from "@/lib/ticketDesign";

export type LayoutConfig = {
  cssWidth: number;
  padding?: number;
  /** Native ticket width — grid is horizontally centred in cssWidth (hybrid path). */
  fixedCardWidth?: number;
};

export function getFixedTicketRowWidth(cardWidth = TICKET_DESIGN_WIDTH): number {
  return TICKETS_PER_ROW * cardWidth + (TICKETS_PER_ROW - 1) * ROW_GAP;
}

export function resolveCenteredGridPadding(
  cssWidth: number,
  cardWidth = TICKET_DESIGN_WIDTH,
): number {
  return Math.max(0, (cssWidth - getFixedTicketRowWidth(cardWidth)) / 2);
}

/** Hybrid grid: fixed 197×43 tickets, centred with equal side padding. */
export function buildHybridLayoutConfig(cssWidth: number): LayoutConfig {
  return { cssWidth, padding: 0, fixedCardWidth: TICKET_DESIGN_WIDTH };
}

function resolveLayoutPadding(config: LayoutConfig): number {
  if (config.fixedCardWidth) {
    return resolveCenteredGridPadding(config.cssWidth, config.fixedCardWidth);
  }
  return config.padding ?? GRID_PADDING;
}

function resolveCardWidth(config: LayoutConfig): number {
  if (config.fixedCardWidth) return config.fixedCardWidth;
  return getCardWidth(config.cssWidth, config.padding ?? GRID_PADDING);
}

export type TicketSlot = {
  id: number;
  index: number;
  x: number;
  y: number;
  cardWidth: number;
};

export type ReorderTransition = {
  id: number;
  fromIndex: number;
  toIndex: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export function getCardWidth(cssWidth: number, padding = GRID_PADDING) {
  const innerWidth = cssWidth - padding * 2;
  return (innerWidth - ROW_GAP * (TICKETS_PER_ROW - 1)) / TICKETS_PER_ROW;
}

export function getSlotForIndex(
  index: number,
  config: LayoutConfig,
): Pick<TicketSlot, "x" | "y"> {
  const padding = resolveLayoutPadding(config);
  const cardWidth = resolveCardWidth(config);
  const row = Math.floor(index / TICKETS_PER_ROW);
  const col = index % TICKETS_PER_ROW;
  return {
    x: padding + col * (cardWidth + ROW_GAP),
    y: row * ROW_HEIGHT,
  };
}

export function buildLayout(
  tickets: Ticket[],
  config: LayoutConfig,
): TicketSlot[] {
  const cardWidth = resolveCardWidth(config);
  return tickets.map((ticket, index) => {
    const { x, y } = getSlotForIndex(index, config);
    return { id: ticket.id, index, x, y, cardWidth };
  });
}

/**
 * Bundle adds prepend at the top — shift existing slot Y values instead of a full
 * O(n) layout rebuild.
 */
export function prependTicketsLayout(
  prependedTickets: Ticket[],
  existingLayout: TicketSlot[],
  config: LayoutConfig,
): TicketSlot[] {
  const cardWidth = resolveCardWidth(config);
  const yShift =
    Math.ceil(prependedTickets.length / TICKETS_PER_ROW) * ROW_HEIGHT;

  const newSlots: TicketSlot[] = prependedTickets.map((ticket, index) => {
    const { x, y } = getSlotForIndex(index, config);
    return { id: ticket.id, index, x, y, cardWidth };
  });

  const shifted: TicketSlot[] = existingLayout.map((slot) => ({
    ...slot,
    index: slot.index + prependedTickets.length,
    y: slot.y + yShift,
  }));

  return [...newSlots, ...shifted];
}

/** Detect top-prepend adds (bundle buttons) and return shifted layout. */
export function tryPrependLayout(
  prevTickets: Ticket[],
  nextTickets: Ticket[],
  prevLayout: TicketSlot[],
  config: LayoutConfig,
): TicketSlot[] | null {
  if (
    nextTickets.length <= prevTickets.length ||
    prevLayout.length === 0 ||
    prevTickets.length === 0
  ) {
    return null;
  }

  const added = nextTickets.length - prevTickets.length;
  const rest = nextTickets.slice(added);
  if (rest.length !== prevTickets.length) return null;

  for (let i = 0; i < prevTickets.length; i++) {
    if (rest[i]?.id !== prevTickets[i]?.id) return null;
  }

  return prependTicketsLayout(nextTickets.slice(0, added), prevLayout, config);
}

/** How many cells match the removed ball (higher = closer to top). */
export function getMatchScore(ticket: Ticket, ball: number) {
  return ticket.cells.filter(
    (cell) => cell.type === "number" && cell.value === ball,
  ).length;
}

export function sortTicketsAfterBallRemoval(
  tickets: Ticket[],
  removedBall: number,
): Ticket[] {
  return [...tickets].sort((a, b) => {
    const scoreDiff =
      getMatchScore(b, removedBall) - getMatchScore(a, removedBall);
    if (scoreDiff !== 0) return scoreDiff;
    if (a.isWinning !== b.isWinning) return a.isWinning ? -1 : 1;
    return a.id - b.id;
  });
}

export function shuffleTickets(tickets: Ticket[]): Ticket[] {
  const arr = [...tickets];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Inner width available for painting (excludes container padding). */
export function getDrawableWidth(container: HTMLElement) {
  const style = getComputedStyle(container);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  return Math.max(0, container.clientWidth - padL - padR);
}

export function computeReorderTransitions(
  prevTickets: Ticket[],
  nextTickets: Ticket[],
  config: LayoutConfig,
): ReorderTransition[] {
  const prevIndexById = new Map(prevTickets.map((t, i) => [t.id, i]));
  const transitions: ReorderTransition[] = [];

  nextTickets.forEach((ticket, toIndex) => {
    const fromIndex = prevIndexById.get(ticket.id);
    if (fromIndex === undefined || fromIndex === toIndex) return;

    const from = getSlotForIndex(fromIndex, config);
    const to = getSlotForIndex(toIndex, config);

    transitions.push({
      id: ticket.id,
      fromIndex,
      toIndex,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
    });
  });

  return transitions;
}

export function getContentHeightForCount(count: number) {
  return getContentHeight(count);
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 2);
}

/** Fast start, soft landing — reads more clearly on shuffle/reorder motion. */
export function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

export function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

/** Tickets visible in viewport (+ margin for animating tickets). */
export function getVisibleTicketIds(
  slots: TicketSlot[],
  scrollTop: number,
  viewportHeight: number,
  margin = ROW_HEIGHT,
) {
  const minY = scrollTop - margin;
  const maxY = scrollTop + viewportHeight + margin;
  return slots
    .filter((slot) => {
      const bottom = slot.y + TICKET_HEIGHT;
      return bottom >= minY && slot.y <= maxY;
    })
    .map((slot) => slot.id);
}

/** Index range for layout slots intersecting the viewport (+ vertical margin). */
export function getVisibleSlotIndexRange(
  totalSlots: number,
  scrollTop: number,
  viewportHeight: number,
  verticalMargin = 20,
): { startIndex: number; endIndex: number } {
  if (totalSlots <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const top = scrollTop - verticalMargin;
  const bottom = scrollTop + viewportHeight + verticalMargin;
  const firstRow = Math.max(0, Math.floor(top / ROW_HEIGHT));
  const lastRow = Math.max(0, Math.floor(bottom / ROW_HEIGHT));
  const startIndex = Math.min(totalSlots, firstRow * TICKETS_PER_ROW);
  const endIndex = Math.min(totalSlots, (lastRow + 1) * TICKETS_PER_ROW);
  return { startIndex, endIndex: Math.max(startIndex, endIndex) };
}

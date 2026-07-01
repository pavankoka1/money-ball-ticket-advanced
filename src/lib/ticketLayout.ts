import { snapToDevicePixel } from "@/lib/canvasSetup";
import {
  MOBILE_ROW_GAP,
  DESKTOP_ROW_GAP,
  resolveIsMobileTicketLayout,
  resolveTicketGridColumns,
  getTicketGridColumns,
  getLayoutRowHeight,
} from "@/lib/ticketGridLayout";
import {
  clampCatalogCssWidth,
  DESKTOP_CATALOG_MAX_WIDTH,
} from "@/lib/catalogLayout";
import { DESKTOP_TICKETS_PER_ROW } from "@/lib/ticketGridLayout";
import { TICKET_DESIGN_WIDTH, TICKET_MOBILE_DESIGN_WIDTH } from "@/lib/ticketDesign";
import { getSdrDisplayScale } from "@/lib/sdrDisplayScale";
import type { Ticket } from "@/types/ticket";
import {
  GRID_PADDING,
  ROW_GAP,
  TICKET_HEIGHT,
  getContentHeight,
} from "@/types/ticket";

export type LayoutConfig = {
  cssWidth: number;
  columns: number;
  padding?: number;
  rowGap?: number;
  /** When true, tickets pack from the left edge (no horizontal centring). */
  edgeAligned?: boolean;
  fixedCardWidth?: number;
};

export function getFixedTicketRowWidth(
  columns: number,
  cardWidth = TICKET_DESIGN_WIDTH,
  rowGap = ROW_GAP,
): number {
  return columns * cardWidth + (columns - 1) * rowGap;
}

export function resolveCenteredGridPadding(
  cssWidth: number,
  columns: number,
  cardWidth = TICKET_DESIGN_WIDTH,
  rowGap = ROW_GAP,
): number {
  const raw = Math.max(
    0,
    (cssWidth - getFixedTicketRowWidth(columns, cardWidth, rowGap)) / 2,
  );
  const scale =
    typeof window !== "undefined" ? getSdrDisplayScale() : 1;
  return snapToDevicePixel(raw, scale);
}

/** Hybrid grid — mobile: 1–2 × 181px centred; desktop: fixed 1001px, 5 × 197px, 4px gap. */
export function buildHybridLayoutConfig(cssWidth: number): LayoutConfig {
  const mobile = resolveIsMobileTicketLayout(cssWidth);
  if (mobile) {
    const catalogWidth = clampCatalogCssWidth(cssWidth);
    return {
      cssWidth: catalogWidth,
      columns: resolveTicketGridColumns(catalogWidth),
      padding: 0,
      rowGap: MOBILE_ROW_GAP,
      fixedCardWidth: TICKET_MOBILE_DESIGN_WIDTH,
    };
  }
  return {
    cssWidth: DESKTOP_CATALOG_MAX_WIDTH,
    columns: DESKTOP_TICKETS_PER_ROW,
    padding: 0,
    rowGap: DESKTOP_ROW_GAP,
    fixedCardWidth: TICKET_DESIGN_WIDTH,
  };
}

function resolveLayoutRowGap(config: LayoutConfig): number {
  return config.rowGap ?? ROW_GAP;
}

function resolveLayoutRowHeight(config: LayoutConfig): number {
  return TICKET_HEIGHT + resolveLayoutRowGap(config);
}

function resolveLayoutPadding(config: LayoutConfig): number {
  if (config.edgeAligned) return config.padding ?? 0;
  if (config.fixedCardWidth) {
    return resolveCenteredGridPadding(
      config.cssWidth,
      config.columns,
      config.fixedCardWidth,
      resolveLayoutRowGap(config),
    );
  }
  return config.padding ?? GRID_PADDING;
}

function resolveCardWidth(config: LayoutConfig): number {
  if (config.fixedCardWidth) return config.fixedCardWidth;
  const padding = config.padding ?? GRID_PADDING;
  const rowGap = resolveLayoutRowGap(config);
  const innerWidth = config.cssWidth - padding * 2;
  return (innerWidth - rowGap * (config.columns - 1)) / config.columns;
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

export function getCardWidth(
  cssWidth: number,
  columns: number,
  padding = GRID_PADDING,
) {
  const innerWidth = cssWidth - padding * 2;
  return (innerWidth - ROW_GAP * (columns - 1)) / columns;
}

function resolveLastRowOffsetX(
  config: LayoutConfig,
  row: number,
  col: number,
  totalCount: number,
): number {
  const columns = config.columns;
  if (totalCount <= 0 || columns <= 1) return 0;

  const ticketsInLastRow = totalCount % columns || columns;
  if (ticketsInLastRow >= columns) return 0;

  const totalRows = Math.ceil(totalCount / columns);
  if (row !== totalRows - 1 || col >= ticketsInLastRow) return 0;

  const cardWidth = resolveCardWidth(config);
  const rowGap = resolveLayoutRowGap(config);
  const fullRowWidth = columns * cardWidth + (columns - 1) * rowGap;
  const partialRowWidth =
    ticketsInLastRow * cardWidth + (ticketsInLastRow - 1) * rowGap;
  const raw = (fullRowWidth - partialRowWidth) / 2;
  const scale =
    typeof window !== "undefined" ? getSdrDisplayScale() : 1;
  return snapToDevicePixel(raw, scale);
}

export function getSlotForIndex(
  index: number,
  config: LayoutConfig,
  totalCount?: number,
): Pick<TicketSlot, "x" | "y"> {
  const padding = resolveLayoutPadding(config);
  const cardWidth = resolveCardWidth(config);
  const columns = config.columns;
  const rowGap = resolveLayoutRowGap(config);
  const rowHeight = resolveLayoutRowHeight(config);
  const row = Math.floor(index / columns);
  const col = index % columns;
  const lastRowOffsetX =
    totalCount !== undefined
      ? resolveLastRowOffsetX(config, row, col, totalCount)
      : 0;
  return {
    x: padding + lastRowOffsetX + col * (cardWidth + rowGap),
    y: row * rowHeight,
  };
}

export function buildLayout(
  tickets: Ticket[],
  config: LayoutConfig,
): TicketSlot[] {
  const cardWidth = resolveCardWidth(config);
  return tickets.map((ticket, index) => {
    const { x, y } = getSlotForIndex(index, config, tickets.length);
    return { id: ticket.id, index, x, y, cardWidth };
  });
}

export function prependTicketsLayout(
  prependedTickets: Ticket[],
  existingLayout: TicketSlot[],
  config: LayoutConfig,
): TicketSlot[] {
  const yShift =
    Math.ceil(prependedTickets.length / config.columns) *
    resolveLayoutRowHeight(config);

  const newSlots: TicketSlot[] = prependedTickets.map((ticket, index) => {
    const { x, y } = getSlotForIndex(index, config);
    const cardWidth = resolveCardWidth(config);
    return { id: ticket.id, index, x, y, cardWidth };
  });

  const shifted: TicketSlot[] = existingLayout.map((slot) => ({
    ...slot,
    index: slot.index + prependedTickets.length,
    y: slot.y + yShift,
  }));

  return [...newSlots, ...shifted];
}

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

export function getDrawableWidth(container: HTMLElement) {
  const style = getComputedStyle(container);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  return Math.max(0, Math.floor(container.clientWidth - padL - padR));
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

    const from = getSlotForIndex(fromIndex, config, nextTickets.length);
    const to = getSlotForIndex(toIndex, config, nextTickets.length);

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

/** Extra rows above/below viewport included in shuffle animation band. */
export const SHUFFLE_VIEWPORT_MARGIN_ROWS = 1;

export function getViewportSlotIndexRange(
  totalSlots: number,
  scrollTop: number,
  viewportHeight: number,
  marginRows = SHUFFLE_VIEWPORT_MARGIN_ROWS,
): { startIndex: number; endIndex: number } {
  const columns = getTicketGridColumns();
  const margin = marginRows * getLayoutRowHeight();
  return getVisibleSlotIndexRange(
    totalSlots,
    scrollTop,
    viewportHeight,
    columns,
    margin,
  );
}

/** Ticket ids whose slots intersect the viewport band (prev or next layout). */
export function getViewportTicketIds(
  layout: readonly TicketSlot[],
  scrollTop: number,
  viewportHeight: number,
  marginRows = SHUFFLE_VIEWPORT_MARGIN_ROWS,
): Set<number> {
  const { startIndex, endIndex } = getViewportSlotIndexRange(
    layout.length,
    scrollTop,
    viewportHeight,
    marginRows,
  );
  const ids = new Set<number>();
  for (let i = startIndex; i < endIndex; i++) {
    const slot = layout[i];
    if (slot) ids.add(slot.id);
  }
  return ids;
}

/**
 * Only animate tickets entering or leaving the viewport band — not the full catalog.
 * Union of prev-viewport ids and next-viewport ids (catalogUtils pattern).
 */
export function filterViewportReorderTransitions(
  transitions: readonly ReorderTransition[],
  prevLayout: readonly TicketSlot[],
  nextLayout: readonly TicketSlot[],
  scrollTop: number,
  viewportHeight: number,
  marginRows = SHUFFLE_VIEWPORT_MARGIN_ROWS,
): ReorderTransition[] {
  const prevVisible = getViewportTicketIds(
    prevLayout,
    scrollTop,
    viewportHeight,
    marginRows,
  );
  const nextVisible = getViewportTicketIds(
    nextLayout,
    scrollTop,
    viewportHeight,
    marginRows,
  );
  const animateIds = new Set<number>();
  for (const id of prevVisible) animateIds.add(id);
  for (const id of nextVisible) animateIds.add(id);
  return transitions.filter((t) => animateIds.has(t.id));
}

/** Draw order for shuffle — next-layout order, restricted to the viewport union. */
export function getShuffleDrawIds(
  prevLayout: readonly TicketSlot[],
  nextLayout: readonly TicketSlot[],
  scrollTop: number,
  viewportHeight: number,
  marginRows = SHUFFLE_VIEWPORT_MARGIN_ROWS,
): number[] {
  const prevVisible = getViewportTicketIds(
    prevLayout,
    scrollTop,
    viewportHeight,
    marginRows,
  );
  const nextVisible = getViewportTicketIds(
    nextLayout,
    scrollTop,
    viewportHeight,
    marginRows,
  );
  const ids = new Set<number>();
  for (const id of prevVisible) ids.add(id);
  for (const id of nextVisible) ids.add(id);
  return nextLayout.filter((slot) => ids.has(slot.id)).map((slot) => slot.id);
}

const SHUFFLE_EDGE_GAP = 4;

function slotIntersectsViewport(
  slotY: number,
  scrollTop: number,
  viewportHeight: number,
): boolean {
  return (
    slotY + TICKET_HEIGHT > scrollTop && slotY < scrollTop + viewportHeight
  );
}

/**
 * Shuffle motion endpoints — tickets entering the viewport start just above/below
 * the visible band instead of flying from their off-screen catalog slot.
 */
export function getShuffleAnimationEndpoints(
  transition: ReorderTransition,
  scrollTop: number,
  viewportHeight: number,
  edgeGap = SHUFFLE_EDGE_GAP,
): { fromX: number; fromY: number; toX: number; toY: number } {
  const { fromX, fromY, toX, toY } = transition;
  const viewTop = scrollTop;
  const viewBottom = scrollTop + viewportHeight;

  const toInView = slotIntersectsViewport(toY, scrollTop, viewportHeight);
  const fromInView = slotIntersectsViewport(fromY, scrollTop, viewportHeight);

  let animFromX = fromX;
  let animFromY = fromY;
  let animToX = toX;
  let animToY = toY;

  if (toInView && !fromInView) {
    // Entering: slide in at destination column from just above/below the viewport.
    animFromX = toX;
    if (fromY + TICKET_HEIGHT <= viewTop) {
      animFromY = viewTop - TICKET_HEIGHT - edgeGap;
    } else if (fromY >= viewBottom) {
      animFromY = viewBottom + edgeGap;
    }
  } else if (fromInView && !toInView) {
    // Leaving: exit at destination column (may differ from current column).
    animToX = toX;
    if (toY + TICKET_HEIGHT <= viewTop) {
      animToY = viewTop - TICKET_HEIGHT - edgeGap;
    } else if (toY >= viewBottom) {
      animToY = viewBottom + edgeGap;
    }
  }

  return {
    fromX: animFromX,
    fromY: animFromY,
    toX: animToX,
    toY: animToY,
  };
}

export function getContentHeightForCount(count: number) {
  return getContentHeight(count);
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 2);
}

export function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

export function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

export function getVisibleTicketIds(
  slots: TicketSlot[],
  scrollTop: number,
  viewportHeight: number,
  margin = getLayoutRowHeight(),
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

export function getVisibleSlotIndexRange(
  totalSlots: number,
  scrollTop: number,
  viewportHeight: number,
  columns: number,
  verticalMargin = 20,
): { startIndex: number; endIndex: number } {
  if (totalSlots <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const top = scrollTop - verticalMargin;
  const bottom = scrollTop + viewportHeight + verticalMargin;
  const rowH = getLayoutRowHeight();
  const firstRow = Math.max(0, Math.floor(top / rowH));
  const lastRow = Math.max(0, Math.floor(bottom / rowH));
  const startIndex = Math.min(totalSlots, firstRow * columns);
  const endIndex = Math.min(totalSlots, (lastRow + 1) * columns);
  return { startIndex, endIndex: Math.max(startIndex, endIndex) };
}

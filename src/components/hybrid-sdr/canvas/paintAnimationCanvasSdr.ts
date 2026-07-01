import {
  getShuffleAnimationEndpoints,
  lerp,
  type TicketSlot,
} from "@/lib/ticketLayout";
import { getSdrDisplayScale } from "@/lib/sdrDisplayScale";
import { getLayoutRowHeight } from "@/lib/ticketGridLayout";
import { TICKET_HEIGHT, type Ticket } from "@/types/ticket";
import {
  ANIMATION_MS,
  getEasingFn,
  type ActiveShuffleAnimation,
} from "./animation";
import { paintHybridTicketOnViewport } from "./hybridTicketRenderer";

export type PaintAnimationCanvasSdrArgs = {
  canvas: HTMLCanvasElement;
  cssWidth: number;
  viewportHeight: number;
  scrollTop: number;
  tickets: readonly Ticket[];
  animation: ActiveShuffleAnimation;
  now: number;
};

function syncCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): CanvasRenderingContext2D | null {
  const compositorScale = getSdrDisplayScale();
  const w = Math.max(1, Math.round(cssWidth * compositorScale));
  const h = Math.max(1, Math.round(cssHeight * compositorScale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.style.maxWidth = "none";
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  ctx.setTransform(compositorScale, 0, 0, compositorScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function buildTransitionMap(
  transitions: ActiveShuffleAnimation["viewportTransitions"],
): Map<number, ActiveShuffleAnimation["viewportTransitions"][number]> {
  const map = new Map<
    number,
    ActiveShuffleAnimation["viewportTransitions"][number]
  >();
  for (const t of transitions) map.set(t.id, t);
  return map;
}

function buildSlotMap(layout: readonly TicketSlot[]): Map<number, TicketSlot> {
  const map = new Map<number, TicketSlot>();
  for (const slot of layout) map.set(slot.id, slot);
  return map;
}

/**
 * Sticky viewport canvas — viewport-band shuffle only; entering tickets start
 * just above/below the visible strip.
 */
export function paintAnimationCanvasSdr({
  canvas,
  cssWidth,
  viewportHeight,
  scrollTop,
  tickets,
  animation,
  now,
}: PaintAnimationCanvasSdrArgs): void {
  const ctx = syncCanvas(canvas, cssWidth, viewportHeight);
  if (!ctx) return;
  ctx.clearRect(0, 0, cssWidth, viewportHeight);

  const animT = Math.min(1, (now - animation.startTime) / ANIMATION_MS);
  const eased = getEasingFn(animation.easing)(animT);
  const transitionById = buildTransitionMap(animation.viewportTransitions);
  const nextSlotById = buildSlotMap(animation.nextLayout);
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const verticalMargin = getLayoutRowHeight();
  const displayScale = getSdrDisplayScale();
  const animating = animT < 1;

  for (const id of animation.drawIds) {
    const ticket = ticketById.get(id);
    if (!ticket) continue;

    const transition = transitionById.get(id);
    const nextSlot = nextSlotById.get(id);

    let x: number;
    let y: number;
    let cardWidth = nextSlot?.cardWidth;

    if (transition) {
      const endpoints = getShuffleAnimationEndpoints(
        transition,
        scrollTop,
        viewportHeight,
      );
      x = animating
        ? lerp(endpoints.fromX, endpoints.toX, eased)
        : endpoints.toX;
      y = animating
        ? lerp(endpoints.fromY, endpoints.toY, eased)
        : endpoints.toY;
    } else if (nextSlot) {
      x = nextSlot.x;
      y = nextSlot.y;
      cardWidth = nextSlot.cardWidth;
    } else {
      continue;
    }

    const viewY = y - scrollTop;
    if (
      viewY + TICKET_HEIGHT < -verticalMargin ||
      viewY > viewportHeight + verticalMargin
    ) {
      continue;
    }

    const drawX = animating ? x : Math.round(x);
    const drawY = animating ? viewY : Math.round(viewY);

    paintHybridTicketOnViewport(
      ctx,
      ticket,
      drawX,
      drawY,
      displayScale,
      cardWidth,
    );
  }
}

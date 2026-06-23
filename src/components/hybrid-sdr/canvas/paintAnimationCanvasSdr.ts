import {
  getVisibleSlotIndexRange,
  lerp,
  type ReorderTransition,
  type TicketSlot,
} from "@/lib/ticketLayout";
import { getSdrDisplayScale } from "@/lib/sdrDisplayScale";
import { ROW_HEIGHT, TICKET_HEIGHT, type Ticket } from "@/types/ticket";
import {
  ANIMATION_MS,
  getEasingFn,
  type ActiveAnimation,
} from "./animation";
import { paintHybridTicketOnViewport } from "./hybridTicketRenderer";

export type PaintAnimationCanvasSdrArgs = {
  canvas: HTMLCanvasElement;
  cssWidth: number;
  viewportHeight: number;
  scrollTop: number;
  layout: readonly TicketSlot[];
  tickets: readonly Ticket[];
  animation: ActiveAnimation;
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
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  ctx.setTransform(compositorScale, 0, 0, compositorScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function buildTransitionMap(transitions: ReorderTransition[]) {
  const map = new Map<number, ReorderTransition>();
  for (const t of transitions) map.set(t.id, t);
  return map;
}

/** Sticky viewport canvas — domMatched hybrid sprites, same path as reference hybrid. */
export function paintAnimationCanvasSdr({
  canvas,
  cssWidth,
  viewportHeight,
  scrollTop,
  layout,
  tickets,
  animation,
  now,
}: PaintAnimationCanvasSdrArgs): void {
  const ctx = syncCanvas(canvas, cssWidth, viewportHeight);
  if (!ctx) return;
  ctx.clearRect(0, 0, cssWidth, viewportHeight);

  const animT = Math.min(1, (now - animation.startTime) / ANIMATION_MS);
  const eased = getEasingFn(animation.easing)(animT);
  const transitionById = buildTransitionMap(animation.transitions);
  const verticalMargin = ROW_HEIGHT * 2;
  const displayScale = getSdrDisplayScale();
  const animating = animT < 1;

  const { startIndex, endIndex } = getVisibleSlotIndexRange(
    layout.length,
    scrollTop,
    viewportHeight,
    verticalMargin,
  );

  for (let i = startIndex; i < endIndex; i++) {
    const slot = layout[i];
    if (!slot) continue;
    const ticket = tickets[slot.index];
    if (!ticket) continue;

    let x = slot.x;
    let y = slot.y;

    const transition = transitionById.get(slot.id);
    if (transition) {
      if (animT < 1) {
        x = lerp(transition.fromX, transition.toX, eased);
        y = lerp(transition.fromY, transition.toY, eased);
      } else {
        x = transition.toX;
        y = transition.toY;
      }
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

    paintHybridTicketOnViewport(ctx, ticket, drawX, drawY, displayScale);
  }
}

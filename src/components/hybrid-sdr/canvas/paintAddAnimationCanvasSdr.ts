import {
  getAddAnimationHorizontalBleed,
  resolveAddEnterVisual,
} from "@/lib/ticketAddAnimation";
import {
  easeOutCubic,
  lerp,
  type ReorderTransition,
  type TicketSlot,
} from "@/lib/ticketLayout";
import { getSdrDisplayScale } from "@/lib/sdrDisplayScale";
import { getLayoutRowHeight } from "@/lib/ticketGridLayout";
import { TICKET_HEIGHT, type Ticket } from "@/types/ticket";
import type { ActiveAddAnimation } from "./animation";
import { paintHybridTicketOnViewport } from "./hybridTicketRenderer";

export type PaintAddAnimationCanvasSdrArgs = {
  canvas: HTMLCanvasElement;
  cssWidth: number;
  viewportHeight: number;
  scrollTop: number;
  tickets: readonly Ticket[];
  animation: ActiveAddAnimation;
  now: number;
  horizontalBleed?: number;
};

function syncCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  horizontalBleed: number,
): CanvasRenderingContext2D | null {
  const compositorScale = getSdrDisplayScale();
  const paintWidth = cssWidth + horizontalBleed * 2;
  const w = Math.max(1, Math.round(paintWidth * compositorScale));
  const h = Math.max(1, Math.round(cssHeight * compositorScale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${paintWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.style.maxWidth = "none";
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  ctx.setTransform(compositorScale, 0, 0, compositorScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function paintTicketAt(
  ctx: CanvasRenderingContext2D,
  ticket: Ticket,
  x: number,
  viewY: number,
  cardWidth: number,
  displayScale: number,
  scale: number,
  opacity: number,
): void {
  if (opacity <= 0.001 || scale <= 0.001) return;

  const w = cardWidth;
  const h = TICKET_HEIGHT;
  const cx = x + w / 2;
  const cy = viewY + h / 2;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
  paintHybridTicketOnViewport(ctx, ticket, 0, 0, displayScale, w);
  ctx.restore();
}

export function paintAddAnimationCanvasSdr({
  canvas,
  cssWidth,
  viewportHeight,
  scrollTop,
  tickets,
  animation,
  now,
  horizontalBleed = getAddAnimationHorizontalBleed(),
}: PaintAddAnimationCanvasSdrArgs): void {
  const bleed = horizontalBleed;
  const paintWidth = cssWidth + bleed * 2;
  const ctx = syncCanvas(canvas, cssWidth, viewportHeight, bleed);
  if (!ctx) return;
  ctx.clearRect(0, 0, paintWidth, viewportHeight);

  const elapsed = now - animation.startTime;
  const shiftT = Math.min(1, elapsed / animation.shiftDurationMs);
  const enterT = Math.min(1, elapsed / animation.durationMs);
  const shiftEased = easeOutCubic(shiftT);
  const displayScale = getSdrDisplayScale();
  const verticalMargin = getLayoutRowHeight();

  const transitionById = new Map<number, ReorderTransition>();
  for (const t of animation.shiftTransitions) transitionById.set(t.id, t);

  const nextSlotById = new Map<number, TicketSlot>();
  for (const slot of animation.nextLayout) nextSlotById.set(slot.id, slot);

  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const enterSet = animation.enterTicketIds;

  for (const id of animation.drawIds) {
    const ticket = ticketById.get(id);
    const nextSlot = nextSlotById.get(id);
    if (!ticket || !nextSlot) continue;

    let x = nextSlot.x + bleed;
    let y = nextSlot.y;
    let scale = 1;
    let opacity = 1;

    const transition = transitionById.get(id);
    if (transition) {
      x = lerp(transition.fromX, transition.toX, shiftEased) + bleed;
      y = lerp(transition.fromY, transition.toY, shiftEased);
    }

    if (enterSet.has(id)) {
      const visual = resolveAddEnterVisual(enterT);
      scale = visual.scale;
      opacity = visual.opacity;
    }

    const viewY = y - scrollTop;
    if (
      viewY + TICKET_HEIGHT < -verticalMargin ||
      viewY > viewportHeight + verticalMargin
    ) {
      continue;
    }

    paintTicketAt(
      ctx,
      ticket,
      x,
      viewY,
      nextSlot.cardWidth,
      displayScale,
      scale,
      opacity,
    );
  }
}

import {
  getShuffleAnimationEndpoints,
  type ReorderTransition,
  type TicketSlot,
} from "@/lib/ticketLayout";
import type { Ticket } from "@/types/ticket";
import { DomPoolSlot } from "./DomPoolSlot";
import { ANIMATION_MS, getDomEasingCss, type ReorderEasing } from "../canvas/animation";

export type RunDomViewportShuffleArgs = {
  drawIds: readonly number[];
  viewportTransitions: readonly ReorderTransition[];
  nextLayout: readonly TicketSlot[];
  ticketsById: ReadonlyMap<number, Ticket>;
  poolSlots: readonly DomPoolSlot[];
  scrollTop: number;
  viewportHeight: number;
  durationMs?: number;
  easing?: ReorderEasing;
};

export async function runDomViewportShuffleAnimation({
  drawIds,
  viewportTransitions,
  nextLayout,
  ticketsById,
  poolSlots,
  scrollTop,
  viewportHeight,
  durationMs = ANIMATION_MS,
  easing = "cubic",
}: RunDomViewportShuffleArgs): Promise<void> {
  const transitionById = new Map(viewportTransitions.map((t) => [t.id, t]));
  const nextSlotById = new Map(nextLayout.map((s) => [s.id, s]));
  const easingCss = getDomEasingCss(easing);
  const animations: Animation[] = [];

  for (let i = 0; i < poolSlots.length; i++) {
    const poolSlot = poolSlots[i];
    const id = drawIds[i];

    if (id === undefined) {
      poolSlot.hide();
      continue;
    }

    const ticket = ticketsById.get(id);
    const nextSlot = nextSlotById.get(id);
    if (!ticket || !nextSlot) {
      poolSlot.hide();
      continue;
    }

    const transition = transitionById.get(id);
    const endpoints = transition
      ? getShuffleAnimationEndpoints(transition, scrollTop, viewportHeight)
      : { fromX: nextSlot.x, fromY: nextSlot.y, toX: nextSlot.x, toY: nextSlot.y };

    poolSlot.applyShuffleTicket(
      ticket,
      endpoints.fromX,
      endpoints.fromY,
      nextSlot.cardWidth,
    );

    if (
      transition &&
      (endpoints.fromX !== endpoints.toX || endpoints.fromY !== endpoints.toY)
    ) {
      animations.push(
        poolSlot.animateShuffleTo(
          endpoints.toX,
          endpoints.toY,
          durationMs,
          easingCss,
        ),
      );
    }
  }

  if (animations.length === 0) return;

  await Promise.all(
    animations.map(
      (animation) =>
        new Promise<void>((resolve) => {
          animation.addEventListener("finish", () => resolve(), { once: true });
          animation.addEventListener("cancel", () => resolve(), { once: true });
        }),
    ),
  );
}

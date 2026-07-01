import {
  easeOutCubic,
  easeOutExpo,
  type ReorderTransition,
  type TicketSlot,
} from "@/lib/ticketLayout";
import { TICKET_ADD_ANIM } from "@/lib/ticketAddAnimation";
import type { Ticket } from "@/types/ticket";

export const ANIMATION_MS = 400;

export type ReorderEasing = "cubic" | "expo";

export type ActiveShuffleAnimation = {
  kind: "shuffle";
  viewportTransitions: ReorderTransition[];
  nextLayout: TicketSlot[];
  drawIds: number[];
  startTime: number;
  nextTickets: Ticket[];
  easing: ReorderEasing;
};

export type ActiveAddAnimation = {
  kind: "add";
  shiftTransitions: ReorderTransition[];
  enterTicketIds: ReadonlySet<number>;
  nextLayout: TicketSlot[];
  drawIds: number[];
  startTime: number;
  durationMs: number;
  shiftDurationMs: number;
};

export type ActiveAnimation = ActiveShuffleAnimation | ActiveAddAnimation;

export function isAddAnimation(
  animation: ActiveAnimation,
): animation is ActiveAddAnimation {
  return animation.kind === "add";
}

export function getAddAnimationDurationMs(): number {
  return TICKET_ADD_ANIM.DURATION_MS;
}

export function getEasingFn(easing: ReorderEasing) {
  return easing === "expo" ? easeOutExpo : easeOutCubic;
}

/** CSS easing string approximating {@link getEasingFn}. */
export function getDomEasingCss(easing: ReorderEasing): string {
  return easing === "expo" ? "ease-out" : "cubic-bezier(0.33, 1, 0.68, 1)";
}

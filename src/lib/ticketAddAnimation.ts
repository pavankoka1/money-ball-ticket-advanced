import { TICKET_DESIGN_WIDTH } from "@/lib/ticketDesign";
import {
  computeReorderTransitions,
  filterViewportReorderTransitions,
  getViewportTicketIds,
  type LayoutConfig,
  type ReorderTransition,
  type TicketSlot,
} from "@/lib/ticketLayout";
import type { Ticket } from "@/types/ticket";

/**
 * Desktop row at rest: 5 × 197px + 4 × 4px gap = 1001px (DESKTOP_CATALOG_MAX_WIDTH).
 *
 * Peak overlap (video ~2.03s): left ticket right edge meets neighbour first-cell right edge.
 *   gap(S) = (197 + 4) − 197·S  →  S_peak = 201/165 ≈ 1.218
 * Mid undershoot (~2.17s, ~12px visual gap): S = 189/197 ≈ 0.959
 */
export const TICKET_ADD_ANIM = {
  SCALE_OVERSHOOT: 201 / 165,
  SCALE_UNDERSHOOT: 189 / 197,
  PHASE_MID: 0.5,
  DURATION_MS: 320,
  /** Opacity reaches 1 by this fraction of linear time (~19ms). */
  OPACITY_RAMP: 0.06,
  EASING: "ease-in-out",
  TRANSFORM_ORIGIN: "center center",
} as const;

export type AddAnimationPlan = {
  shiftTransitions: ReorderTransition[];
  enterTicketIds: readonly number[];
  drawIds: readonly number[];
};

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Horizontal bleed so centre-scaled tickets are not clipped during overshoot. */
export function getAddAnimationHorizontalBleed(
  cardWidth = TICKET_DESIGN_WIDTH,
): number {
  return Math.ceil(
    (cardWidth * (TICKET_ADD_ANIM.SCALE_OVERSHOOT - 1)) / 2,
  );
}

/** Enter scale + opacity for normalized time t ∈ [0, 1]. */
export function resolveAddEnterVisual(t: number): { opacity: number; scale: number } {
  const { SCALE_OVERSHOOT, SCALE_UNDERSHOOT, PHASE_MID, OPACITY_RAMP } =
    TICKET_ADD_ANIM;
  const linear = Math.min(1, Math.max(0, t));
  const opacity = Math.min(1, linear / OPACITY_RAMP);
  const eased = easeInOut(linear);

  if (eased <= PHASE_MID) {
    const u = eased / PHASE_MID;
    return {
      opacity,
      scale: SCALE_OVERSHOOT + (SCALE_UNDERSHOOT - SCALE_OVERSHOOT) * u,
    };
  }
  const u = (eased - PHASE_MID) / (1 - PHASE_MID);
  return {
    opacity: 1,
    scale: SCALE_UNDERSHOOT + (1 - SCALE_UNDERSHOOT) * u,
  };
}

export function buildTicketAddFlowKeyframes(): Keyframe[] {
  const { SCALE_OVERSHOOT, SCALE_UNDERSHOOT, PHASE_MID } = TICKET_ADD_ANIM;
  return [
    { opacity: 0, transform: `scale(${SCALE_OVERSHOOT})`, offset: 0 },
    { opacity: 1, transform: `scale(${SCALE_UNDERSHOOT})`, offset: PHASE_MID },
    { opacity: 1, transform: "scale(1)", offset: 1 },
  ];
}

export function buildAddAnimationPlan(
  prevTickets: readonly Ticket[],
  nextTickets: readonly Ticket[],
  prevLayout: readonly TicketSlot[],
  nextLayout: readonly TicketSlot[],
  newTicketIds: readonly number[],
  config: LayoutConfig,
  scrollTop: number,
  viewportHeight: number,
): AddAnimationPlan {
  const shiftTransitions = filterViewportReorderTransitions(
    computeReorderTransitions([...prevTickets], [...nextTickets], config),
    prevLayout,
    nextLayout,
    scrollTop,
    viewportHeight,
  );

  const nextVisible = getViewportTicketIds(
    nextLayout,
    scrollTop,
    viewportHeight,
  );
  const enterTicketIds = newTicketIds.filter((id) => nextVisible.has(id));

  const drawIdSet = new Set<number>();
  for (const t of shiftTransitions) drawIdSet.add(t.id);
  for (const id of enterTicketIds) drawIdSet.add(id);

  const prevVisible = getViewportTicketIds(
    prevLayout,
    scrollTop,
    viewportHeight,
  );
  for (const id of prevVisible) drawIdSet.add(id);
  for (const id of nextVisible) drawIdSet.add(id);

  const drawIds = nextLayout
    .filter((slot) => drawIdSet.has(slot.id))
    .map((slot) => slot.id);

  return { shiftTransitions, enterTicketIds, drawIds };
}

export function shouldRunAddAnimation(plan: AddAnimationPlan): boolean {
  return plan.shiftTransitions.length > 0 || plan.enterTicketIds.length > 0;
}

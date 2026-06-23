import {
  easeOutCubic,
  easeOutExpo,
  type ReorderTransition,
} from "@/lib/ticketLayout";
import type { Ticket } from "@/types/ticket";

export const ANIMATION_MS = 400;

export type ReorderEasing = "cubic" | "expo";

export type ActiveAnimation = {
  transitions: ReorderTransition[];
  startTime: number;
  nextTickets: Ticket[];
  easing: ReorderEasing;
};

export function getEasingFn(easing: ReorderEasing) {
  return easing === "expo" ? easeOutExpo : easeOutCubic;
}

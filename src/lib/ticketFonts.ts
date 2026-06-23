import { TICKET_ID_TEXT, TICKET_TEXT } from "@/lib/ticketDesign";

const ONEST_PROBE_ID = "onest-font-probe";

function resolveOnestFamily(): string {
  if (typeof document === "undefined") return TICKET_TEXT.family;
  const probe = document.getElementById(ONEST_PROBE_ID);
  return probe ? getComputedStyle(probe).fontFamily : TICKET_TEXT.family;
}

/** Same font string as /ticket Canvas 2D row (Next.js Onest via probe). */
export function resolveTicketBodyFontSpec(): string {
  return `${TICKET_TEXT.weight} ${TICKET_TEXT.size}px ${resolveOnestFamily()}`;
}

/** Same id font string as /ticket Canvas 2D row. */
export function resolveTicketIdFontSpec(): string {
  return `${TICKET_ID_TEXT.weight} ${TICKET_ID_TEXT.size}px ${resolveOnestFamily()}`;
}

export { ONEST_PROBE_ID };

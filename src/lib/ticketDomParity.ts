import { REFERENCE_TICKET, TICKET_DESIGN_HEIGHT, TICKET_DESIGN_WIDTH } from "@/lib/ticketDesign";
import { createTicketSprite } from "@/lib/ticketRenderer";
import type { Ticket } from "@/types/ticket";
import { DomPoolSlot } from "@/components/hybrid-sdr/dom/DomPoolSlot";

export type TicketDomParityReport = {
  domWidth: number;
  domHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  widthDelta: number;
  heightDelta: number;
  ok: boolean;
};

const REFERENCE_STUB: Ticket = {
  id: REFERENCE_TICKET.id,
  cells: REFERENCE_TICKET.values.map((value) => ({
    type: "number" as const,
    value,
  })),
  isWinning: false,
};

/** Compare a hidden DomTicketCard against a domMatched canvas sprite. */
export function measureTicketDomCanvasParity(): TicketDomParityReport | null {
  if (typeof document === "undefined") return null;

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(host);

  DomPoolSlot.initTemplate();
  const dom = DomPoolSlot.template!.cloneNode(true) as HTMLElement;
  dom.style.visibility = "visible";
  dom.style.transform = "none";
  host.appendChild(dom);

  const idEl = dom.querySelector("[class*='domTicketCard__id']") as HTMLElement;
  const cellEls = Array.from(
    dom.querySelectorAll("[class*='domTicketCard__cell']"),
  ) as HTMLElement[];
  if (idEl) idEl.textContent = String(REFERENCE_TICKET.id);
  REFERENCE_TICKET.values.forEach((value, index) => {
    if (cellEls[index]) cellEls[index].textContent = String(value);
  });

  const domRect = dom.getBoundingClientRect();
  const sprite = createTicketSprite(REFERENCE_STUB, "enhanced");
  sprite.style.width = `${TICKET_DESIGN_WIDTH}px`;
  sprite.style.height = `${TICKET_DESIGN_HEIGHT}px`;
  host.appendChild(sprite);
  const canvasRect = sprite.getBoundingClientRect();

  host.remove();

  const widthDelta = canvasRect.width - domRect.width;
  const heightDelta = canvasRect.height - domRect.height;
  const ok = Math.abs(widthDelta) < 0.5 && Math.abs(heightDelta) < 0.5;

  return {
    domWidth: domRect.width,
    domHeight: domRect.height,
    canvasWidth: canvasRect.width,
    canvasHeight: canvasRect.height,
    widthDelta,
    heightDelta,
    ok,
  };
}

export function logTicketDomCanvasParityIfNeeded(): void {
  if (!import.meta.env.DEV) return;
  const report = measureTicketDomCanvasParity();
  if (!report) return;
  if (report.ok) {
    console.log(
      `[ticket parity] DOM ${report.domWidth.toFixed(2)}×${report.domHeight.toFixed(2)}px = canvas ${report.canvasWidth.toFixed(2)}×${report.canvasHeight.toFixed(2)}px`,
    );
    return;
  }
  console.warn(
    `[ticket parity] mismatch — DOM ${report.domWidth.toFixed(2)}×${report.domHeight.toFixed(2)} vs canvas ${report.canvasWidth.toFixed(2)}×${report.canvasHeight.toFixed(2)} (Δw=${report.widthDelta.toFixed(2)} Δh=${report.heightDelta.toFixed(2)})`,
  );
}

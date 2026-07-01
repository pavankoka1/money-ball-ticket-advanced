import {
  TICKET_CELL_COUNT,
  TICKET_DESIGN_HEIGHT,
  TICKET_DESIGN_WIDTH,
  TICKET_MOBILE_DESIGN_WIDTH,
} from "@/lib/ticketDesign";
import { isMobileTicketLayout } from "@/lib/ticketGridLayout";
import type { DomPoolEntry } from "../lib/domPool";
import styles from "./DomTicketCard.module.css";
export class DomPoolSlot {
  static template: HTMLElement | null = null;
  static mobileTemplate: HTMLElement | null = null;

  readonly dom: HTMLElement;
  private readonly idEl: HTMLSpanElement;
  private readonly cellEls: HTMLSpanElement[];

  static initTemplate(): void {
    if (DomPoolSlot.template) return;

    const article = document.createElement("article");
    article.className = styles.domTicketCard;

    const header = document.createElement("header");
    header.className = styles.domTicketCard__header;

    const idEl = document.createElement("span");
    idEl.className = styles.domTicketCard__id;
    header.appendChild(idEl);
    article.appendChild(header);

    const body = document.createElement("div");
    body.className = styles.domTicketCard__body;

    for (let i = 0; i < TICKET_CELL_COUNT; i++) {
      const cell = document.createElement("span");
      cell.className = styles.domTicketCard__cell;
      body.appendChild(cell);

      if (i < TICKET_CELL_COUNT - 1) {
        const separator = document.createElement("span");
        separator.className = styles.domTicketCard__separator;
        separator.setAttribute("aria-hidden", "true");
        body.appendChild(separator);
      }
    }
    article.appendChild(body);

    DomPoolSlot.template = article;
  }

  static initMobileTemplate(): void {
    if (DomPoolSlot.mobileTemplate) return;
    DomPoolSlot.initTemplate();
    const article = DomPoolSlot.template!.cloneNode(true) as HTMLElement;
    article.classList.add(styles.domTicketCard_mobile);
    DomPoolSlot.mobileTemplate = article;
  }

  constructor() {
    this.dom = this.createDomForCurrentLayout();
    this.idEl = this.dom.querySelector(
      `.${styles.domTicketCard__id}`,
    ) as HTMLSpanElement;
    this.cellEls = Array.from(
      this.dom.querySelectorAll(`.${styles.domTicketCard__cell}`),
    ) as HTMLSpanElement[];
    this.dom.style.visibility = "hidden";
  }

  private isMobileLayout(): boolean {
    return isMobileTicketLayout();
  }

  private createDomForCurrentLayout(): HTMLElement {
    if (this.isMobileLayout()) {
      DomPoolSlot.initMobileTemplate();
      return DomPoolSlot.mobileTemplate!.cloneNode(true) as HTMLElement;
    }
    DomPoolSlot.initTemplate();
    return DomPoolSlot.template!.cloneNode(true) as HTMLElement;
  }

  private defaultCardWidth(): number {
    return this.isMobileLayout()
      ? TICKET_MOBILE_DESIGN_WIDTH
      : TICKET_DESIGN_WIDTH;
  }

  applyEntry(entry: DomPoolEntry): void {
    if (!entry.active) {
      this.hide();
      return;
    }

    this.cancelAnimations();
    this.dom.style.visibility = "visible";
    this.dom.style.opacity = "1";
    this.dom.style.transformOrigin = "";
    this.dom.style.width = `${entry.cardWidth || this.defaultCardWidth()}px`;
    this.dom.style.height = `${TICKET_DESIGN_HEIGHT}px`;
    this.dom.style.transform = `translate3d(${entry.x}px, ${entry.y}px, 0)`;
    this.populateTicket(entry.ticket);
  }

  hide(): void {
    if (this.dom.style.visibility === "hidden") return;
    this.cancelAnimations();
    this.dom.style.visibility = "hidden";
    this.dom.style.opacity = "";
    this.dom.style.transform = "";
    this.dom.style.transformOrigin = "";
  }

  cancelAnimations(): void {
    this.dom.getAnimations().forEach((a) => a.cancel());
  }

  applyShuffleTicket(
    ticket: DomPoolEntry["ticket"],
    x: number,
    y: number,
    cardWidth: number,
  ): void {
    this.cancelAnimations();
    this.dom.style.visibility = "visible";
    this.dom.style.width = `${cardWidth || this.defaultCardWidth()}px`;
    this.dom.style.height = `${TICKET_DESIGN_HEIGHT}px`;
    this.dom.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    this.populateTicket(ticket);
  }

  animateShuffleTo(
    toX: number,
    toY: number,
    durationMs: number,
    easing: string,
  ): Animation {
    const fromTransform = this.dom.style.transform;
    return this.dom.animate(
      [
        { transform: fromTransform },
        { transform: `translate3d(${toX}px, ${toY}px, 0)` },
      ],
      { duration: durationMs, easing, fill: "forwards" },
    );
  }

  private populateTicket(ticket: DomPoolEntry["ticket"]): void {
    this.dom.dataset.ticketId = String(ticket.id);
    this.idEl.textContent = String(ticket.id);
    ticket.cells.forEach((cell, index) => {
      const cellEl = this.cellEls[index];
      if (cellEl) cellEl.textContent = String(cell.value);
    });
  }
}

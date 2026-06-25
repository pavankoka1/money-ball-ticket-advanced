import {
  TICKET_CELL_COUNT,
  TICKET_DESIGN_HEIGHT,
  TICKET_DESIGN_WIDTH,
} from "@/lib/ticketDesign";
import type { DomPoolEntry } from "../lib/domPool";
import styles from "./DomTicketCard.module.css";

export class DomPoolSlot {
  static template: HTMLElement | null = null;

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

  constructor() {
    DomPoolSlot.initTemplate();
    this.dom = DomPoolSlot.template!.cloneNode(true) as HTMLElement;
    this.idEl = this.dom.querySelector(
      `.${styles.domTicketCard__id}`,
    ) as HTMLSpanElement;
    this.cellEls = Array.from(
      this.dom.querySelectorAll(`.${styles.domTicketCard__cell}`),
    ) as HTMLSpanElement[];
    this.dom.style.visibility = "hidden";
  }

  applyEntry(entry: DomPoolEntry): void {
    if (!entry.active) {
      this.dom.style.visibility = "hidden";
      this.dom.style.transform = "";
      return;
    }

    this.dom.style.visibility = "visible";
    this.dom.style.width = `${entry.cardWidth || TICKET_DESIGN_WIDTH}px`;
    this.dom.style.height = `${TICKET_DESIGN_HEIGHT}px`;
    this.dom.style.transform = `translate3d(${entry.x}px, ${entry.y}px, 0)`;
    this.dom.dataset.ticketId = String(entry.ticket.id);
    this.idEl.textContent = String(entry.ticket.id);

    entry.ticket.cells.forEach((cell, index) => {
      const cellEl = this.cellEls[index];
      if (cellEl) cellEl.textContent = String(cell.value);
    });
  }
}

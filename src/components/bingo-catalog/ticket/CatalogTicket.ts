import { TICKET_CELL_COUNT } from "@/lib/ticketDesign";
import { TicketStore, type CatalogTicketUpdate } from "../store/TicketStore";
import styles from "./catalogTicket.module.css";

const CLASS_CROWN = styles.catalogTicket__cell_crown;
const CLASS_HIT = styles.catalogTicket__cell_hit;
const CLASS_WINNING = styles.catalogTicket_winning;

export class CatalogTicket {
  static placeholder: HTMLElement | null = null;

  readonly dom: HTMLElement;
  readonly id: number;

  private readonly idEl: HTMLSpanElement;
  private readonly cellEls: HTMLSpanElement[];
  private readonly hitIndices = new Set<number>();

  static initPlaceholder(): void {
    if (CatalogTicket.placeholder) return;

    const article = document.createElement("article");
    article.className = styles.catalogTicket;

    const idEl = document.createElement("span");
    idEl.className = styles.catalogTicket__id;
    article.appendChild(idEl);

    const body = document.createElement("div");
    body.className = styles.catalogTicket__body;

    for (let i = 0; i < TICKET_CELL_COUNT; i++) {
      const cell = document.createElement("span");
      cell.className = styles.catalogTicket__cell;
      body.appendChild(cell);
    }
    article.appendChild(body);

    CatalogTicket.placeholder = article;
  }

  constructor(id: number) {
    this.id = id;

    CatalogTicket.initPlaceholder();
    this.dom = CatalogTicket.placeholder!.cloneNode(true) as HTMLElement;
    this.dom.dataset.ticketId = String(id);

    this.idEl = this.dom.querySelector(
      `.${styles.catalogTicket__id}`,
    ) as HTMLSpanElement;

    this.cellEls = Array.from(
      this.dom.querySelectorAll(`.${styles.catalogTicket__cell}`),
    ) as HTMLSpanElement[];

    this.updateTicketFromStore();
  }

  updateTicketFromStore(withAnimations = false): void {
    const state = TicketStore.getTicketUpdate(this.id, withAnimations);
    if (state) {
      this.updateTicket(state[0], state[1], withAnimations);
    }
  }

  updateTicket(
    update: CatalogTicketUpdate,
    last: CatalogTicketUpdate,
    withAnimations = false,
  ): void {
    if (update.index !== undefined) {
      this.idEl.textContent = String(
        TicketStore.getTicketById(this.id)?.id ?? this.id,
      );
    } else if (!this.idEl.textContent) {
      this.idEl.textContent = String(this.id);
    }

    if (update.cellValues) {
      update.cellValues.forEach((value, index) => {
        const cell = this.cellEls[index];
        if (cell) cell.textContent = String(value);
      });
    }

    if (update.cellIsCrown) {
      update.cellIsCrown.forEach((isCrown, index) => {
        const cell = this.cellEls[index];
        if (!cell) return;
        if (isCrown) cell.classList.add(CLASS_CROWN);
        else cell.classList.remove(CLASS_CROWN);
      });
    }

    const newHits = last.hitIndices
      ? update.hitIndices?.slice(-last.hitIndices.length)
      : update.hitIndices;

    if (newHits?.length) {
      newHits.forEach((index) => {
        this.hitIndices.add(index);
        const cell = this.cellEls[index];
        cell?.classList.add(CLASS_HIT);

        if (withAnimations && last.hitIndices) {
          cell?.animate(
            [
              { transform: "scale(1)" },
              { transform: "scale(1.12)" },
              { transform: "scale(1)" },
            ],
            { duration: 280, easing: "ease-out" },
          );
        }
      });
    }

    if (update.isWinning !== undefined) {
      this.dom.classList.toggle(CLASS_WINNING, update.isWinning);
    }
  }
}

"use client";

import { TICKET_CELL_COUNT } from "@/lib/ticketDesign";
import type { DomPoolEntry } from "../lib/domPool";
import {
  forwardRef,
  Fragment,
  memo,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import styles from "./DomTicketCard.module.css";

export type PoolTicketSlotHandle = {
  applyEntry: (entry: DomPoolEntry) => void;
};

type PoolTicketSlotProps = {
  /** Initial paint during staggered mount; hot path uses `applyEntry`. */
  entry: DomPoolEntry;
};

/**
 * Fixed 197×43 pool slot — imperative `applyEntry` bypasses React on scroll-idle rebind.
 * Structure matches virtual-ticket-grid DomTicketCard (no scaling).
 */
export const PoolTicketSlot = memo(
  forwardRef(function PoolTicketSlot(
    { entry }: PoolTicketSlotProps,
    ref: Ref<PoolTicketSlotHandle>,
  ) {
    const articleRef = useRef<HTMLElement>(null);
    const idRef = useRef<HTMLSpanElement>(null);
    const cellRefs = useRef<(HTMLSpanElement | null)[]>([]);

    const applyEntry = (next: DomPoolEntry) => {
      const root = articleRef.current;
      if (!root) return;

      if (!next.active) {
        root.style.visibility = "hidden";
        root.style.transform = "";
        return;
      }

      root.style.visibility = "visible";
      root.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
      root.dataset.ticketId = String(next.ticket.id);

      if (idRef.current) {
        idRef.current.textContent = String(next.ticket.id);
      }

      next.ticket.cells.forEach((cell, index) => {
        const cellEl = cellRefs.current[index];
        if (cellEl) cellEl.textContent = String(cell.value);
      });
    };

    useImperativeHandle(ref, () => ({ applyEntry }), []);

    return (
      <article
        ref={articleRef}
        className={styles.domTicketCard}
        data-ticket-id={entry.ticket.id}
        style={{
          visibility: entry.active ? "visible" : "hidden",
          transform: entry.active
            ? `translate3d(${entry.x}px, ${entry.y}px, 0)`
            : undefined,
        }}
      >
        <header className={styles.domTicketCard__header}>
          <span ref={idRef} className={styles.domTicketCard__id}>
            {entry.ticket.id}
          </span>
        </header>

        <div className={styles.domTicketCard__body}>
          {entry.ticket.cells.map((cell, index) => (
            <Fragment key={index}>
              <span
                ref={(el) => {
                  cellRefs.current[index] = el;
                }}
                className={styles.domTicketCard__cell}
              >
                {cell.value}
              </span>
              {index < TICKET_CELL_COUNT - 1 ? (
                <span className={styles.domTicketCard__separator} aria-hidden />
              ) : null}
            </Fragment>
          ))}
        </div>
      </article>
    );
  }),
);

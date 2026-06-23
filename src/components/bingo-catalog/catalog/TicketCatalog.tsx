import { VIEWPORT_HEIGHT } from "@/types/ticket";
import { useEffect, useRef, useState } from "react";
import { CATALOG_CONFIG } from "../lib/catalogConfig";
import { TicketStore } from "../store/TicketStore";
import type { CatalogTicket } from "../ticket/CatalogTicket";
import {
  calculateContainerAttributes,
  fadeInAnimation,
  shuffleAnimationDelayed,
  type ContainerAttrs,
} from "./catalogUtils";
import { mountCatalogTickets } from "./mountCatalogTickets";
import styles from "./TicketCatalog.module.css";

const TICKET_ANIMATED_COUNT = 5;

let ticketsSorted: number[] = [];
const tickets: Record<number, CatalogTicket> = {};
let containerAttrs: ContainerAttrs = calculateContainerAttributes();
let isCatalogScrolledToTop = true;

export function TicketCatalog() {
  const ref = useRef<HTMLDivElement>(null);
  const [ticketCount, setTicketCount] = useState(0);

  const showTickets = (withAnimations?: number[]) => {
    if (!ticketsSorted.length) return;

    const visibleSlice = ticketsSorted.slice(0, containerAttrs.visibleTicketsCount);
    const targetIds = withAnimations ?? visibleSlice;

    targetIds.forEach((id) => {
      tickets[id]?.updateTicketFromStore(Boolean(withAnimations));
    });
  };

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    containerAttrs = calculateContainerAttributes();

    const onScroll = () => {
      isCatalogScrolledToTop = container.scrollTop <= 1;
    };
    container.addEventListener("scroll", onScroll, { passive: true });

    const countListener = TicketStore.addEventListener("count", (count) => {
      setTicketCount(count as number);
    });

    const addListener = TicketStore.addEventListener("add", (ids, replace) => {
      const idList = ids as number[];
      const isReplace = Boolean(replace);

      if (isReplace) {
        Object.keys(tickets).forEach((key) => delete tickets[Number(key)]);
        ticketsSorted = [...idList];
      } else {
        ticketsSorted = [...idList, ...ticketsSorted];
      }

      const isBulkAdd = idList.length >= CATALOG_CONFIG.ANIMATION.NEW_TICKETS_THRESHOLD;

      void (async () => {
        const newDomNodes = await mountCatalogTickets(container, idList, tickets, {
          replace: isReplace,
        });

        requestAnimationFrame(() => {
          if (!isBulkAdd) {
            newDomNodes.slice(-TICKET_ANIMATED_COUNT).reduce((delay, dom) => {
              fadeInAnimation(dom, delay);
              return delay + CATALOG_CONFIG.ANIMATION.DELAY_INCREMENT;
            }, idList.length > TICKET_ANIMATED_COUNT ? CATALOG_CONFIG.ANIMATION.INITIAL_DELAY : 0);
          }

          container.scrollTo({
            top: 0,
            behavior: isBulkAdd ? "instant" : "smooth",
          });
        });

        showTickets();
      })();
    });

    const removeListener = TicketStore.addEventListener("remove", (ids) => {
      (ids as number[]).forEach((id) => {
        tickets[id]?.dom.remove();
        delete tickets[id];
        ticketsSorted = ticketsSorted.filter((ticketId) => ticketId !== id);
      });
    });

    const resetListener = TicketStore.addEventListener("reset", () => {
      container.textContent = "";
      ticketsSorted = [];
      Object.keys(tickets).forEach((key) => delete tickets[Number(key)]);
      isCatalogScrolledToTop = true;
    });

    const sortListener = TicketStore.addEventListener("sort", (ticketIds) => {
      const order = ticketIds as number[];
      if (order.length < 2) return;

      const prevTicketOrder = ticketsSorted;
      ticketsSorted = order;

      if (!isCatalogScrolledToTop) return;

      showTickets();
      shuffleAnimationDelayed(
        container,
        containerAttrs,
        prevTicketOrder,
        order,
        tickets,
      );
    });

    const updateListener = TicketStore.addEventListener("update", (ticketIds) => {
      const ids = ticketIds as number[];
      const visibleIds = ticketsSorted
        .slice(0, containerAttrs.visibleTicketsCount)
        .filter((id) => ids.includes(id));

      showTickets(visibleIds);
    });

    TicketStore.processQueue();

    const existingIds = TicketStore.getSortedIds();
    if (existingIds.length > 0 && ticketsSorted.length === 0) {
      ticketsSorted = [...existingIds];
      setTicketCount(existingIds.length);
      void mountCatalogTickets(container, existingIds, tickets, { replace: true }).then(
        () => {
          showTickets();
        },
      );
    }

    return () => {
      TicketStore.stopQueue();
      container.removeEventListener("scroll", onScroll);
      countListener();
      addListener();
      removeListener();
      resetListener();
      sortListener();
      updateListener();
    };
  }, []);

  return (
    <section className={styles.catalogWrap}>
      <div className={styles.meta}>
        <span>
          {ticketCount} ticket{ticketCount === 1 ? "" : "s"} in DOM
        </span>
        <span className={styles.hint}>Native scroll · zero JS on scroll · FLIP at top</span>
      </div>

      <div
        ref={ref}
        className={styles.catalog}
        style={{ maxHeight: `${VIEWPORT_HEIGHT + 48}px` }}
      >
        {ticketCount === 0 && (
          <div className={styles.empty}>Add tickets to see them here.</div>
        )}
      </div>
    </section>
  );
}

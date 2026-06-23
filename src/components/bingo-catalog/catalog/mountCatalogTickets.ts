import { CATALOG_CONFIG } from "../lib/catalogConfig";
import { CatalogTicket } from "../ticket/CatalogTicket";

const yieldFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

export async function mountCatalogTickets(
  container: HTMLElement,
  idList: readonly number[],
  tickets: Record<number, CatalogTicket>,
  options: { replace: boolean },
): Promise<HTMLElement[]> {
  const batchSize = CATALOG_CONFIG.MOUNT_BATCH_SIZE;
  const newDomNodes: HTMLElement[] = [];

  if (options.replace) {
    container.textContent = "";
  }

  const mountBatch = (batchIds: readonly number[]) => {
    const fragment = document.createDocumentFragment();
    batchIds.forEach((id) => {
      const ticket = new CatalogTicket(id);
      tickets[id] = ticket;
      newDomNodes.push(ticket.dom);
      fragment.append(ticket.dom);
    });
    container.insertBefore(fragment, container.firstChild);
  };

  if (idList.length <= batchSize) {
    mountBatch(idList);
    return newDomNodes;
  }

  for (let offset = idList.length; offset > 0; ) {
    const start = Math.max(0, offset - batchSize);
    mountBatch(idList.slice(start, offset));
    offset = start;
    if (offset > 0) {
      await yieldFrame();
    }
  }

  return newDomNodes;
}

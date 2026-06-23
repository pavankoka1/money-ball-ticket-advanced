import type { CatalogTicketUpdate } from "../store/TicketStore";

export function mergeTicketUpdate(
  target: CatalogTicketUpdate,
  patch: CatalogTicketUpdate,
): void {
  if (patch.index !== undefined) target.index = patch.index;
  if (patch.cellValues !== undefined) target.cellValues = patch.cellValues;
  if (patch.cellIsCrown !== undefined) target.cellIsCrown = patch.cellIsCrown;
  if (patch.isWinning !== undefined) target.isWinning = patch.isWinning;
  if (patch.hitIndices !== undefined) {
    target.hitIndices = [...(target.hitIndices ?? []), ...patch.hitIndices];
  }
}

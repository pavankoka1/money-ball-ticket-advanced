"use client";

import {
  HYBRID_DOM_OVERLAY_POOL_SIZE,
  type DomPoolEntry,
} from "../lib/domPool";
import { PoolTicketSlot, type PoolTicketSlotHandle } from "./PoolTicketSlot";
import type { RefObject } from "react";

type TallGridDomOverlayPoolProps = {
  overlayRef: RefObject<HTMLDivElement | null>;
  /** Pool container mounts on first activation; slots fill in batches across RAFs. */
  poolReady: boolean;
  /** How many pool slots have been mounted so far (staggered warm-up). */
  mountedSlotCount: number;
  entries: readonly DomPoolEntry[];
  slotRefs: RefObject<(PoolTicketSlotHandle | null)[]>;
};

/**
 * Fixed-index DOM pool in content coordinates. Keys are pool index (0..n-1),
 * never ticket id. Scroll-idle rebind uses imperative `applyEntry` — no churn.
 */
export function TallGridDomOverlayPool({
  overlayRef,
  poolReady,
  mountedSlotCount,
  entries,
  slotRefs,
}: TallGridDomOverlayPoolProps) {
  if (!poolReady || mountedSlotCount === 0) return null;

  const slotCount = Math.min(mountedSlotCount, HYBRID_DOM_OVERLAY_POOL_SIZE);

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-[2]"
      aria-hidden
      data-hybrid-optimised-overlay
      style={{ visibility: "hidden" }}
    >
      {Array.from({ length: slotCount }, (_, index) => {
        const entry = entries[index];
        if (!entry) return null;

        return (
          <PoolTicketSlot
            key={index}
            ref={(handle) => {
              slotRefs.current[index] = handle;
            }}
            entry={entry}
          />
        );
      })}
    </div>
  );
}

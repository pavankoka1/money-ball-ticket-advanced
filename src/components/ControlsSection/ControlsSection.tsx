import { BundleButtons } from "@/components/BundleButtons/BundleButtons";
import { resetHybridTicketRenderCaches } from "@/components/hybrid-sdr/canvas/hybridTicketRenderer";
import { resetSdrSpriteCache } from "@/components/hybrid-sdr/canvas/sdrSprite";
import { shuffleTickets } from "@/lib/shuffleTickets";
import { claimTicketsFromPool, resetTicketPool } from "@/lib/ticketPool";
import { MAX_TICKETS } from "@/types/ticket";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { TicketStore } from "../bingo-catalog";
import type { HybridSdrHandle } from "../hybrid-sdr";
import "./ControlsSection.css";

const DEMO_BALLS = [2, 7, 15] as const;

type BenchView = "dom" | "hybrid-sdr";

type ControlsSectionProps = {
  view: BenchView;
  hybridRef: RefObject<HybridSdrHandle | null>;
  layout?: "stack" | "dock";
};

export default function ControlsSection({
  view,
  hybridRef,
  layout = "dock",
}: ControlsSectionProps) {
  const nextIdRef = useRef(1);
  const [ticketCount, setTicketCount] = useState(() => TicketStore.getTicketCount());
  const statusRef = useRef<HTMLSpanElement>(null);

  const isHybrid = view === "hybrid-sdr";
  const isDock = layout === "dock";

  const paintStatus = useCallback(() => {
    const el = statusRef.current;
    if (!el) return;
    el.textContent = `COMPRAR BILHETES ${ticketCount}/${MAX_TICKETS}`;
  }, [ticketCount]);

  useEffect(() => {
    paintStatus();
    return TicketStore.addEventListener("count", (count) => {
      setTicketCount(count as number);
    });
  }, [paintStatus]);

  const handleAdd = useCallback((count: number) => {
    const current = TicketStore.getTicketCount();
    const remaining = MAX_TICKETS - current;
    if (remaining <= 0) return;

    const toAdd = Math.min(count, remaining);
    const startId = nextIdRef.current;
    nextIdRef.current += toAdd;
    TicketStore.addTickets(claimTicketsFromPool(toAdd, startId));
  }, []);

  const handleClear = useCallback(() => {
    TicketStore.reset();
    resetTicketPool();
    resetHybridTicketRenderCaches();
    void resetSdrSpriteCache();
    nextIdRef.current = 1;
  }, []);

  const handleShuffle = useCallback(() => {
    if (TicketStore.getTicketCount() < 2) return;

    if (isHybrid) {
      hybridRef.current?.shuffle();
      return;
    }

    const ids = TicketStore.getSortedIds();
    const tickets = ids
      .map((id) => TicketStore.getTicketById(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);

    TicketStore.sortTickets(shuffleTickets(tickets).map((t) => t.id));
  }, [hybridRef, isHybrid]);

  return (
    <section className={isDock ? "controls controls_dock" : "controls"}>
      {!isDock && (
        <div className="controls__group">
          <h1>Bingo Catalog Bench</h1>
          <p className="controls__subtitle">
            {isHybrid
              ? "Hybrid SDR grid bench"
              : "DOM catalog baseline"}
          </p>
        </div>
      )}

      <div className="controls__dockPanel">
        <div className="controls__dockHeader">
          <span ref={statusRef} className="controls__buyLabel">
            COMPRAR BILHETES {ticketCount}/{MAX_TICKETS}
          </span>
          <div className="controls__dockActions">
            <button type="button" onClick={handleShuffle}>
              Shuffle
            </button>
            <button type="button" onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>

        <BundleButtons
          onAdd={handleAdd}
          disabled={ticketCount >= MAX_TICKETS}
        />

        {isHybrid && (
          <div className="controls__ballRow">
            {DEMO_BALLS.map((ball) => (
              <button
                key={ball}
                type="button"
                className="controls__ballBtn"
                onClick={() => hybridRef.current?.removeBall(ball)}
              >
                Remove ball {ball}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

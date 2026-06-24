import { BundleButtons } from "@/components/BundleButtons/BundleButtons";
import { resetSdrSpriteCache } from "@/components/hybrid-sdr/canvas/sdrSprite";
import { resetHybridTicketRenderCaches } from "@/components/hybrid-sdr/canvas/hybridTicketRenderer";
import { claimTicketsFromPool, resetTicketPool } from "@/lib/ticketPool";
import { shuffleTickets } from "@/lib/shuffleTickets";
import { MAX_TICKETS } from "@/types/ticket";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { TicketStore } from "../bingo-catalog";
import type { HybridSdrHandle } from "../hybrid-sdr";
import "./ControlsSection.css";

const DEMO_BALLS = [2, 7, 15] as const;

type BenchView = "dom" | "hybrid-sdr";

type ControlsSectionProps = {
  view: BenchView;
  hybridRef: RefObject<HybridSdrHandle | null>;
};

export default function ControlsSection({ view, hybridRef }: ControlsSectionProps) {
  const nextIdRef = useRef(1);
  const ticketCountRef = useRef(0);
  const statusRef = useRef<HTMLSpanElement>(null);

  const isHybrid = view === "hybrid-sdr";

  const paintStatus = useCallback(() => {
    const el = statusRef.current;
    if (!el) return;
    el.textContent = `Tickets: ${ticketCountRef.current} / ${MAX_TICKETS}`;
  }, []);

  useEffect(() => {
    ticketCountRef.current = TicketStore.getTicketCount();
    paintStatus();
    return TicketStore.addEventListener("count", (count) => {
      ticketCountRef.current = count as number;
      paintStatus();
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
    <section className="controls">
      <div className="controls__group">
        <h1>Bingo Catalog Bench</h1>
        <p className="controls__subtitle">
          {isHybrid
            ? "Vite · TicketStore · SDR tall canvas hybrid · zero paint on scroll"
            : "Vite · TicketStore · imperative DOM catalog · fair perf baseline"}
        </p>
      </div>

      <div className="controls__group">
        <span className="controls__label">Add tickets</span>
        <BundleButtons
          onAdd={handleAdd}
          disabled={TicketStore.getTicketCount() >= MAX_TICKETS}
        />
        <div className="controls__status">
          <span ref={statusRef}>
            Tickets: {ticketCountRef.current} / {MAX_TICKETS}
          </span>
        </div>
      </div>

      <div className="controls__group">
        <span className="controls__label">Catalog</span>
        <div className="controls__buttons">
          <button type="button" onClick={handleShuffle}>
            Shuffle {isHybrid ? "(canvas)" : "(FLIP)"}
          </button>
          <button type="button" onClick={handleClear}>
            Clear all
          </button>
        </div>
      </div>

      {isHybrid && (
        <div className="controls__group">
          <span className="controls__label">Simulate ball removal</span>
          <div className="controls__buttons">
            {DEMO_BALLS.map((ball) => (
              <button
                key={ball}
                type="button"
                onClick={() => hybridRef.current?.removeBall(ball)}
              >
                Remove ball {ball}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

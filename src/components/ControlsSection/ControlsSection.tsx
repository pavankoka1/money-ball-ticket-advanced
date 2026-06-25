import { BundleButtons } from "@/components/BundleButtons/BundleButtons";
import { resetSdrSpriteCache } from "@/components/hybrid-sdr/canvas/sdrSprite";
import { resetHybridTicketRenderCaches } from "@/components/hybrid-sdr/canvas/hybridTicketRenderer";
import { claimTicketsFromPool, resetTicketPool } from "@/lib/ticketPool";
import { shuffleTickets } from "@/lib/shuffleTickets";
import { setDprOverride } from "@/lib/dprOverride";
import { setDisplayScaleOverride } from "@/lib/displayScaleOverride";
import { setPaintScaleOverride } from "@/lib/paintScaleOverride";
import { MAX_TICKETS } from "@/types/ticket";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { TicketStore } from "../bingo-catalog";
import type { HybridSdrHandle } from "../hybrid-sdr";
import "./ControlsSection.css";

// Options are sorted highest→lowest (default is always the first entry).
// Dropdowns are intentionally one-directional: reduce quality only.
const DPR_OPTIONS            = [1.0, 0.75] as const;
const DISPLAY_SCALE_OPTIONS  = [2, 1]      as const;   // natural at DPR=1
const PAINT_SCALE_OPTIONS    = [8, 6, 4, 2] as const;  // natural at DPR=1

const DEFAULT_DPR           = 1.0;
const DEFAULT_DISPLAY_SCALE = 2;
const DEFAULT_PAINT_SCALE   = 8;

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
  const [dpr, setDpr] = useState<number>(DEFAULT_DPR);
  const [displayScale, setDisplayScale] = useState<number>(DEFAULT_DISPLAY_SCALE);
  const [paintScale, setPaintScale] = useState<number>(DEFAULT_PAINT_SCALE);

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

  // Sync module-level overrides with the default dropdown values on first mount.
  useEffect(() => {
    setDisplayScaleOverride(DEFAULT_DISPLAY_SCALE);
    setPaintScaleOverride(DEFAULT_PAINT_SCALE);
  }, []);

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

  const handleDprChange = useCallback(
    async (nextDpr: number) => {
      setDpr(nextDpr);
      setDprOverride(nextDpr);
      console.log(`[DPR] override set to ${nextDpr}`);

      if (view === "hybrid-sdr") {
        resetHybridTicketRenderCaches();
        await resetSdrSpriteCache();
        await hybridRef.current?.repaint();
      }
    },
    [hybridRef, view],
  );

  const handleDisplayScaleChange = useCallback(
    async (next: number) => {
      setDisplayScale(next);
      setDisplayScaleOverride(next);
      console.log(`[displayScale] set to ${next}`);

      if (view === "hybrid-sdr") {
        resetHybridTicketRenderCaches();
        await resetSdrSpriteCache();
        await hybridRef.current?.repaint();
      }
    },
    [hybridRef, view],
  );

  const handlePaintScaleChange = useCallback(
    async (next: number) => {
      setPaintScale(next);
      setPaintScaleOverride(next);
      console.log(`[paintScale] set to ${next}`);

      if (view === "hybrid-sdr") {
        resetHybridTicketRenderCaches();
        await resetSdrSpriteCache();
        await hybridRef.current?.repaint();
      }
    },
    [hybridRef, view],
  );

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
          <span className="controls__label">Canvas DPR</span>
          <div className="controls__dpr-row">
            <select
              className="controls__dpr-select"
              value={dpr}
              onChange={(e) => void handleDprChange(Number(e.target.value))}
            >
              {DPR_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt.toFixed(2)}×{opt === DEFAULT_DPR ? " (default)" : ""}
                </option>
              ))}
            </select>
            <span className="controls__dpr-hint">
              physical tiles ≈ {(dpr * dpr).toFixed(2)}× area vs 1×
            </span>
          </div>
        </div>
      )}

      {isHybrid && (
        <div className="controls__group">
          <span className="controls__label">Display scale (supersampling)</span>
          <div className="controls__dpr-row">
            <select
              className="controls__dpr-select"
              value={displayScale}
              onChange={(e) => void handleDisplayScaleChange(Number(e.target.value))}
            >
              {DISPLAY_SCALE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}×{opt === DEFAULT_DISPLAY_SCALE ? " (default)" : ""}
                </option>
              ))}
            </select>
            <span className="controls__dpr-hint">
              sprite &amp; tile backing-store pixels per CSS px —
              tile≈{((displayScale * displayScale * 504 * 408 * 4) / 1_048_576).toFixed(1)}MB ea
            </span>
          </div>
        </div>
      )}

      {isHybrid && (
        <div className="controls__group">
          <span className="controls__label">Paint scale (render quality)</span>
          <div className="controls__dpr-row">
            <select
              className="controls__dpr-select"
              value={paintScale}
              onChange={(e) => void handlePaintScaleChange(Number(e.target.value))}
            >
              {PAINT_SCALE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}×{opt === DEFAULT_PAINT_SCALE ? " (default)" : ""}
                </option>
              ))}
            </select>
            <span className="controls__dpr-hint">
              intermediate chrome paint buffer (non-domMatched path)
            </span>
          </div>
        </div>
      )}

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

import { BundleButtons } from "@/components/BundleButtons/BundleButtons";
import { resetSdrSpriteCache } from "@/components/hybrid-sdr/canvas/sdrSprite";
import { resetHybridTicketRenderCaches } from "@/components/hybrid-sdr/canvas/hybridTicketRenderer";
import { claimTicketsFromPool, resetTicketPool } from "@/lib/ticketPool";
import { shuffleTickets } from "@/lib/shuffleTickets";
import { getNativeDpr, setDprOverride } from "@/lib/dprOverride";
import { setDisplayScaleOverride } from "@/lib/displayScaleOverride";
import { setPaintScaleOverride } from "@/lib/paintScaleOverride";
import {
  isConstrainedDevice,
  setResidentTileOverride,
} from "@/lib/deviceMemoryBudget";
import { MAX_TICKETS } from "@/types/ticket";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { TicketStore } from "../bingo-catalog";
import type { HybridSdrHandle } from "../hybrid-sdr";
import "./ControlsSection.css";

// ---------------------------------------------------------------------------
// All defaults are derived from the actual screen DPR at module load time.
// Options are sorted highest→lowest — the dropdown only reduces quality.
// When DPR changes, the scale dropdowns reset to the natural values for the
// new DPR so all three controls stay coherent.
// ---------------------------------------------------------------------------

/** Mirrors resolveTicketChromeRenderScale (MIN_SDR_CHROME_SCALE = 8). */
function naturalPaintScale(dpr: number): number {
  if (dpr >= 2) return dpr * 4;
  return Math.max(dpr * 2, 8);
}

/**
 * Mirrors getSdrDisplayScale:
 *   DPR >= 2 (HiDPI): displayScale = paintScale
 *   DPR <  2 (SDR):   MAX(2, MIN(CEIL(dpr×2), paintCap))
 */
function naturalDisplayScale(dpr: number): number {
  if (dpr >= 2) return naturalPaintScale(dpr);
  const cap = naturalPaintScale(dpr);
  return Math.max(2, Math.min(Math.ceil(dpr * 2), cap));
}

const NATIVE_DPR    = getNativeDpr();
const DEFAULT_DPR   = NATIVE_DPR;

// DPR options are fixed — only values ≤ screen native.
const DPR_OPTIONS = [2.0, 1.5, 1.0, 0.75].filter((v) => v <= NATIVE_DPR);

// Resident-tile cap for device-adaptive virtualization. "auto" follows the
// memory-budget detection; numbers force a cap (simulate mobile on desktop);
// "all" keeps every tile resident (zero paint on scroll). Infinity = all.
const RESIDENT_TILE_OPTIONS: Array<{ value: "auto" | number; label: string }> = [
  { value: "auto", label: "auto" },
  { value: Number.POSITIVE_INFINITY, label: "all (desktop)" },
  { value: 5, label: "5" },
  { value: 3, label: "3 (mobile)" },
  { value: 2, label: "2" },
];

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
  const [dpr, setDpr]               = useState<number>(DEFAULT_DPR);
  const [displayScale, setDisplayScale] = useState<number>(() => naturalDisplayScale(DEFAULT_DPR));
  const [paintScale, setPaintScale]   = useState<number>(() => naturalPaintScale(DEFAULT_DPR));
  const [residentCap, setResidentCap] = useState<"auto" | number>("auto");

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

  // No mount effect needed — both overrides self-initialise in their modules
  // to naturalDisplayScale/naturalPaintScale(window.devicePixelRatio).

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
      const nextDS = naturalDisplayScale(nextDpr);
      const nextPS = naturalPaintScale(nextDpr);

      setDpr(nextDpr);
      setDprOverride(nextDpr);

      // Reset scale dropdowns to the natural values for the new DPR.
      setDisplayScale(nextDS);
      setDisplayScaleOverride(nextDS);
      setPaintScale(nextPS);
      setPaintScaleOverride(nextPS);

      console.log(`[DPR] ${nextDpr}  displayScale→${nextDS}  paintScale→${nextPS}`);

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

  const handleResidentCapChange = useCallback(
    async (next: "auto" | number) => {
      setResidentCap(next);
      setResidentTileOverride(next);
      console.log(`[residentTiles] override set to ${next === Number.POSITIVE_INFINITY ? "all" : next}`);

      if (view === "hybrid-sdr") {
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
              physical tiles ≈ {(dpr * dpr / (NATIVE_DPR * NATIVE_DPR)).toFixed(2)}× area vs native {NATIVE_DPR}×
            </span>
          </div>
        </div>
      )}

      {isHybrid && (() => {
        const naturalDS   = naturalDisplayScale(dpr);
        const dsOptions   = [8, 6, 4, 2, 1].filter((v) => v <= naturalDS);
        return (
          <div className="controls__group">
            <span className="controls__label">Display scale (supersampling)</span>
            <div className="controls__dpr-row">
              <select
                className="controls__dpr-select"
                value={displayScale}
                onChange={(e) => void handleDisplayScaleChange(Number(e.target.value))}
              >
                {dsOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}×{opt === naturalDS ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <span className="controls__dpr-hint">
                tile backing-store per CSS px —
                tile≈{((displayScale * displayScale * 504 * 408 * 4) / 1_048_576).toFixed(1)}MB ea
              </span>
            </div>
          </div>
        );
      })()}

      {isHybrid && (() => {
        const naturalPS   = naturalPaintScale(dpr);
        const psOptions   = [16, 12, 8, 6, 4, 2].filter((v) => v <= naturalPS);
        const isSdr       = dpr < 2;
        return (
          <div className="controls__group">
            <span className="controls__label">Paint scale (render quality)</span>
            <div className="controls__dpr-row">
              <select
                className="controls__dpr-select"
                value={paintScale}
                onChange={(e) => void handlePaintScaleChange(Number(e.target.value))}
              >
                {psOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}×{opt === naturalPS ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <span className="controls__dpr-hint">
                {isSdr
                  ? "SDR: text sprite quality (8× downsample) — chrome stays at displayScale for sharp corners"
                  : "HiDPI: controls sprite buffer size (same as displayScale at this DPR)"}
              </span>
            </div>
          </div>
        );
      })()}

      {isHybrid && (
        <div className="controls__group">
          <span className="controls__label">Resident tiles (device-adaptive)</span>
          <div className="controls__dpr-row">
            <select
              className="controls__dpr-select"
              value={
                residentCap === "auto"
                  ? "auto"
                  : residentCap === Number.POSITIVE_INFINITY
                    ? "all"
                    : String(residentCap)
              }
              onChange={(e) => {
                const v = e.target.value;
                const next: "auto" | number =
                  v === "auto"
                    ? "auto"
                    : v === "all"
                      ? Number.POSITIVE_INFINITY
                      : Number(v);
                void handleResidentCapChange(next);
              }}
            >
              {RESIDENT_TILE_OPTIONS.map((opt) => (
                <option
                  key={opt.label}
                  value={
                    opt.value === "auto"
                      ? "auto"
                      : opt.value === Number.POSITIVE_INFINITY
                        ? "all"
                        : String(opt.value)
                  }
                >
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="controls__dpr-hint">
              {residentCap === "auto"
                ? `auto → ${isConstrainedDevice() ? "constrained: virtualize (3 tiles)" : "desktop: all resident, zero scroll paint"}`
                : "forced cap — lower = less memory, paints tiles on scroll"}
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

import { useRef, useState } from "react";
import gameBackground from "@/assets/game-background.png";
import ControlsSection from "@/components/ControlsSection/ControlsSection";
import { TicketCatalog } from "@/components/bingo-catalog";
import { HybridSdrGrid, type HybridSdrHandle } from "@/components/hybrid-sdr";
import "./App.css";

type BenchView = "dom" | "hybrid-sdr";

export default function App() {
  const [view, setView] = useState<BenchView>("hybrid-sdr");
  const hybridRef = useRef<HybridSdrHandle>(null);

  return (
    <main className="game-page">
      <div
        className="game-page__bg"
        style={{ backgroundImage: `url(${gameBackground})` }}
        aria-hidden
      />

      <div className="game-page__chrome">
        <nav className="bench-nav" aria-label="Bench views">
          <button
            type="button"
            className={
              view === "hybrid-sdr"
                ? "bench-nav__btn bench-nav__btn_active"
                : "bench-nav__btn"
            }
            onClick={() => setView("hybrid-sdr")}
          >
            Hybrid SDR
          </button>
          <button
            type="button"
            className={
              view === "dom"
                ? "bench-nav__btn bench-nav__btn_active"
                : "bench-nav__btn"
            }
            onClick={() => setView("dom")}
          >
            DOM catalog
          </button>
        </nav>

        <div className="game-page__stage">
          {view === "dom" ? <TicketCatalog /> : <HybridSdrGrid ref={hybridRef} />}
        </div>

        <ControlsSection view={view} hybridRef={hybridRef} layout="dock" />
      </div>
    </main>
  );
}

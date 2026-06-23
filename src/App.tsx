import ControlsSection from "./components/ControlsSection/ControlsSection";
import { TicketCatalog } from "./components/bingo-catalog";
import { HybridSdrGrid, type HybridSdrHandle } from "./components/hybrid-sdr";
import { useRef, useState } from "react";
import "./App.css";

type BenchView = "dom" | "hybrid-sdr";

export default function App() {
  const [view, setView] = useState<BenchView>("hybrid-sdr");
  const hybridRef = useRef<HybridSdrHandle>(null);

  return (
    <main className="page">
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
          className={view === "dom" ? "bench-nav__btn bench-nav__btn_active" : "bench-nav__btn"}
          onClick={() => setView("dom")}
        >
          DOM catalog
        </button>
      </nav>

      <ControlsSection view={view} hybridRef={hybridRef} />

      {view === "dom" ? <TicketCatalog /> : <HybridSdrGrid ref={hybridRef} />}
    </main>
  );
}

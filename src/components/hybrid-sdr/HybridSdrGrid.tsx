import "./HybridSdrGrid.css";
import { getSdrTileTopCss } from "@/lib/sdrCanvasTiles";
import { getSdrCompositorScale } from "@/lib/sdrDisplayScale";
import { VIEWPORT_HEIGHT } from "@/types/ticket";
import { forwardRef } from "react";
import { TallGridDomOverlayPool } from "./dom/TallGridDomOverlayPool";
import { HYBRID_DOM_ROW_BUFFER, HYBRID_SCROLL_IDLE_MS } from "./lib/hybridDomSlots";
import { useHybridSdrGrid, type HybridSdrHandle } from "./logic/useHybridSdrGrid";

export type { HybridSdrHandle } from "./logic/useHybridSdrGrid";

export const HybridSdrGrid = forwardRef<HybridSdrHandle>(function HybridSdrGrid(_, ref) {
  const {
    scrollRef,
    tileCount,
    setTileCanvasRef,
    animCanvasRef,
    contentHeight,
    ticketCount,
    layoutWidth,
    domOverlayRef,
  } = useHybridSdrGrid({ handleRef: ref });

  const hasTickets = ticketCount > 0;

  return (
    <div className="hybrid-sdr">
      <div
        ref={scrollRef}
        className="hybrid-sdr__scroll"
        style={{ height: `${VIEWPORT_HEIGHT}px` }}
      >
        {hasTickets ? (
          <div
            className="hybrid-sdr__content"
            style={{
              height: `${contentHeight}px`,
              ...(layoutWidth > 0 ? { width: `${layoutWidth}px` } : null),
            }}
          >
            {Array.from({ length: tileCount }, (_, tileIndex) => (
              <canvas
                key={tileIndex}
                ref={(el) => setTileCanvasRef(tileIndex, el)}
                className="hybrid-sdr__tall-canvas"
                style={{
                  top: `${getSdrTileTopCss(tileIndex, ticketCount, getSdrCompositorScale())}px`,
                }}
                aria-hidden
              />
            ))}

            <canvas
              ref={animCanvasRef}
              className="hybrid-sdr__anim-canvas"
              style={{ height: `${VIEWPORT_HEIGHT}px` }}
              aria-hidden
            />

            <TallGridDomOverlayPool overlayRef={domOverlayRef} />
          </div>
        ) : (
          <div className="hybrid-sdr__empty">
            <span aria-hidden>🎫</span>
            <p>
              No tickets yet.
              <br />
              Click a bundle below.
            </p>
          </div>
        )}
      </div>

      <p className="hybrid-sdr__hint">
        {hasTickets
          ? `Hybrid · canvas scroll/sort · DOM overlay when idle (+${HYBRID_DOM_ROW_BUFFER} row buffer) · ${HYBRID_SCROLL_IDLE_MS}ms debounce`
          : "Hybrid grid · canvas + DOM overlay"}
      </p>
    </div>
  );
});

import "./HybridSdrGrid.css";
import { DESKTOP_CATALOG_MAX_WIDTH } from "@/lib/catalogLayout";
import { getAddAnimationHorizontalBleed } from "@/lib/ticketAddAnimation";
import { getSdrTileTopCss } from "@/lib/sdrCanvasTiles";
import { getSdrCompositorScale } from "@/lib/sdrDisplayScale";
import { getTicketGridColumns } from "@/lib/ticketGridLayout";
import { forwardRef } from "react";
import { TallGridDomOverlayPool } from "./dom/TallGridDomOverlayPool";
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
    viewportHeight,
    domOverlayRef,
    canvasGridMode,
  } = useHybridSdrGrid({ handleRef: ref });

  const hasTickets = ticketCount > 0;
  const catalogWidth = layoutWidth > 0 ? layoutWidth : undefined;
  const addAnimBleed = getAddAnimationHorizontalBleed();
  const animCanvasWidth =
    catalogWidth !== undefined ? catalogWidth + addAnimBleed * 2 : undefined;

  return (
    <div className="hybrid-sdr">
      <div
        className="hybrid-sdr__viewport"
        style={{ maxWidth: `${DESKTOP_CATALOG_MAX_WIDTH}px` }}
      >
        <div
          ref={scrollRef}
          className="hybrid-sdr__scroll"
          style={{ height: `${viewportHeight}px` }}
        >
          {hasTickets ? (
            <div
              className="hybrid-sdr__content"
              style={{
                height: `${contentHeight}px`,
                ...(catalogWidth ? { width: `${catalogWidth}px` } : null),
              }}
            >
              {canvasGridMode &&
                Array.from({ length: tileCount }, (_, tileIndex) => (
                  <canvas
                    key={tileIndex}
                    ref={(el) => setTileCanvasRef(tileIndex, el)}
                    className="hybrid-sdr__tall-canvas"
                    style={{
                      top: `${getSdrTileTopCss(tileIndex, ticketCount, getSdrCompositorScale(), layoutWidth)}px`,
                    }}
                    aria-hidden
                  />
                ))}

              <TallGridDomOverlayPool overlayRef={domOverlayRef} />
            </div>
          ) : (
            <div className="hybrid-sdr__empty">
              <span aria-hidden>🎫</span>
              <p>
                No tickets yet.
                <br />
                Tap a bundle below.
              </p>
            </div>
          )}
        </div>

        {hasTickets && (
          <canvas
            ref={animCanvasRef}
            className="hybrid-sdr__anim-canvas"
            style={{
              height: `${viewportHeight}px`,
              ...(animCanvasWidth ? { width: `${animCanvasWidth}px` } : null),
            }}
            aria-hidden
          />
        )}
      </div>

      <p className="hybrid-sdr__hint">
        {hasTickets
          ? canvasGridMode
            ? `Mobile canvas · ${getTicketGridColumns()} col`
            : `Desktop DOM · ${getTicketGridColumns()} col · max ${DESKTOP_CATALOG_MAX_WIDTH}px`
          : "Add tickets with the bundles below"}
      </p>
    </div>
  );
});

import { TicketStore } from "@/components/bingo-catalog/store/TicketStore";
import { ensureHybridTicketRenderReady, prefetchHybridTextSprites, resetHybridTicketRenderCaches, scheduleWarmHybridDigitSprites } from "@/components/hybrid-sdr/canvas/hybridTicketRenderer";
import { getPoolTicketsForWarm } from "@/lib/ticketPool";
import { ensureGridTicketFontsReady } from "@/lib/ticketRenderer";
import { ensureTicketDisplayFontAtlases } from "@/lib/ticketDisplayAtlases";
import {
  buildHybridLayoutConfig,
  buildLayout,
  computeReorderTransitions,
  filterViewportReorderTransitions,
  getDrawableWidth,
  getShuffleDrawIds,
  shuffleTickets,
  type ReorderTransition,
  type TicketSlot,
} from "@/lib/ticketLayout";
import {
  clampCatalogCssWidth,
  DESKTOP_CATALOG_VIEWPORT_HEIGHT,
  getCatalogLayoutWidth,
  getCatalogViewportHeight,
} from "@/lib/catalogLayout";
import {
  getContentHeight,
  type Ticket,
} from "@/types/ticket";
import type {
  WorkerRequest,
  WorkerResponse,
} from "@/workers/ticketLayout.worker.types";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ForwardedRef,
  type RefObject,
} from "react";
import { DomPoolSlot } from "../dom/DomPoolSlot";
import { runDomViewportShuffleAnimation } from "../dom/domShuffleAnimation";
import {
  ANIMATION_MS,
  isAddAnimation,
  type ActiveAnimation,
  type ReorderEasing,
} from "../canvas/animation";
import { paintAddAnimationCanvasSdr } from "../canvas/paintAddAnimationCanvasSdr";
import {
  computeSdrTileCount,
  computeVisibleTileRange,
  getScrollTileBandKey,
  resolveResidentTileBudgetForGrid,
  viewportNeedsCanvasTiles,
  type SdrTileWindow,
} from "@/lib/sdrCanvasTiles";
import { isConstrainedDevice } from "@/lib/deviceMemoryBudget";
import { isCanvasGridMode, isDomGridMode } from "@/lib/gridRendererMode";
import { syncDisplayScaleForDevice } from "@/lib/displayScaleOverride";
import { syncPaintScaleForDevice } from "@/lib/paintScaleOverride";
import { getSdrCompositorScale, setSdrLayoutCssWidth } from "@/lib/sdrDisplayScale";
import {
  isMobileTicketLayout,
  setTicketGridLayout,
} from "@/lib/ticketGridLayout";
import { paintAnimationCanvasSdr } from "../canvas/paintAnimationCanvasSdr";
import { paintTiledTallCanvasSdrChunked } from "../canvas/paintTallCanvasSdr";
import { resetSdrSpriteCache } from "../canvas/sdrSprite";
import {
  createInitialDomPoolEntries,
  DOM_POOL_MOUNT_BATCH_SIZE,
  getActiveDomPoolSlotCount,
  HYBRID_DOM_OVERLAY_POOL_SIZE,
  updateDomPoolEntriesInPlace,
  type DomPoolEntry,
} from "../lib/domPool";
import {
  getDomScrollBandKey,
  getVisibleDomSlots,
  getViewportRowRange,
  HYBRID_SCROLL_IDLE_MS,
} from "../lib/hybridDomSlots";
import { yieldFrame } from "../lib/yieldFrame";
import {
  buildAddAnimationPlan,
  shouldRunAddAnimation,
  TICKET_ADD_ANIM,
} from "@/lib/ticketAddAnimation";

const SCROLL_METRICS_IDLE_MS = 150;
/** Coalesce rapid bundle clicks into one paint pass. */
const STORE_SYNC_COALESCE_MS = 72;
/** Tickets painted per frame on constrained devices during tall-canvas compositing. */
const CONSTRAINED_PAINT_CHUNK_SIZE = 24;

type PaintTallOptions = {
  rowRange?: { startRow: number; endRow: number };
  fullClear?: boolean;
};

export type HybridSdrHandle = {
  removeBall: (ball: number) => void;
  shuffle: () => void;
  /** Force a full clear + repaint of all tile canvases (e.g. after a DPR change). */
  repaint: () => Promise<void>;
};

export type ScrollMetrics = {
  scrollTop: number;
  progress: number;
  isScrolling: boolean;
};

export type DomOverlayState = {
  active: boolean;
  domNodeCount: number;
};

export type GridMode = "idle" | "scrolling" | "animating";

type UseHybridSdrGridParams = {
  handleRef: ForwardedRef<HybridSdrHandle>;
  onScrollMetrics?: (metrics: ScrollMetrics) => void;
  onAnimatingChange?: (animating: boolean) => void;
  onDomOverlayChange?: (state: DomOverlayState) => void;
  onModeChange?: (mode: GridMode) => void;
  onPaintProgress?: (painted: number, total: number) => void;
  onStatusText?: (text: string) => void;
};

export type UseHybridSdrGridResult = {
  scrollRef: RefObject<HTMLDivElement | null>;
  tileCount: number;
  setTileCanvasRef: (index: number, el: HTMLCanvasElement | null) => void;
  animCanvasRef: RefObject<HTMLCanvasElement | null>;
  contentHeight: number;
  ticketCount: number;
  layoutWidth: number;
  viewportHeight: number;
  domOverlayRef: RefObject<HTMLDivElement | null>;
  canvasGridMode: boolean;
};

function getTicketsFromStore(): Ticket[] {
  return TicketStore.getSortedIds()
    .map((id) => TicketStore.getTicketById(id))
    .filter((t): t is Ticket => t !== undefined);
}

export function useHybridSdrGrid({
  handleRef,
  onScrollMetrics,
  onAnimatingChange,
  onDomOverlayChange,
  onModeChange,
  onPaintProgress,
  onStatusText,
}: UseHybridSdrGridParams): UseHybridSdrGridResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const domOverlayRef = useRef<HTMLDivElement>(null);
  const tileCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  // Non-null only when virtualization is active (memory-constrained device).
  const tileWindowRef = useRef<SdrTileWindow | null>(null);
  const animCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  const ticketsRef = useRef<Ticket[]>([]);
  const layoutRef = useRef<TicketSlot[]>([]);
  const scrollTopRef = useRef(0);
  const cssWidthRef = useRef(0);
  const viewportHeightRef = useRef(DESKTOP_CATALOG_VIEWPORT_HEIGHT);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(
    DESKTOP_CATALOG_VIEWPORT_HEIGHT,
  );
  const [canvasGridModeState, setCanvasGridModeState] = useState(false);
  const animationRef = useRef<ActiveAnimation | null>(null);
  const animationRafRef = useRef<number | null>(null);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollMetricsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollDomRafRef = useRef<number | null>(null);
  const scrollTileRafRef = useRef<number | null>(null);
  const domScrollBandKeyRef = useRef(-1);
  const scrollTileBandKeyRef = useRef(-1);
  const addAnimationActiveRef = useRef(false);
  const animCanvasOnlyRef = useRef(false);
  const addOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef(false);
  const paintAbortRef = useRef<AbortController | null>(null);
  const tallPaintGenRef = useRef(0);
  const storeSyncCoalesceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coalescedPaintRunningRef = useRef(false);
  const coalescedPaintPendingRef = useRef(false);
  const reconcileRunningRef = useRef(false);
  const reconcilePendingRef = useRef(false);
  const domOverlayActiveRef = useRef(false);
  const domPoolMountCompleteRef = useRef(false);
  const domPoolMountPromiseRef = useRef<Promise<void> | null>(null);
  const domPoolEntriesRef = useRef<DomPoolEntry[]>(createInitialDomPoolEntries());
  const ticketByIdRef = useRef<ReadonlyMap<number, Ticket>>(new Map());
  const poolSlotRefs = useRef<DomPoolSlot[]>([]);
  const domPoolMountResolveRef = useRef<(() => void) | null>(null);
  const modeRef = useRef<GridMode>("idle");
  const fontsReadyRef = useRef(false);
  const storeVersionRef = useRef(0);
  const ticketCountRef = useRef(0);
  const gridEpochRef = useRef(0);
  const layoutModeRef = useRef(isMobileTicketLayout());
  /** Constrained: DOM bridge until first successful tall-canvas paint. */
  const constrainedCanvasPaintedRef = useRef(false);

  const domPoolReadyRef = useRef(false);
  const [domPoolReady, setDomPoolReady] = useState(false);
  const [domPoolGeneration, setDomPoolGeneration] = useState(0);
  const [ticketCount, setTicketCount] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [tileCount, setTileCount] = useState(1);

  const bumpGridEpoch = useCallback(() => {
    gridEpochRef.current += 1;
    return gridEpochRef.current;
  }, []);

  const applyDrawableWidth = useCallback((width: number): boolean => {
    if (width <= 0) return false;
    const prevMobile = layoutModeRef.current;
    const catalogWidth = clampCatalogCssWidth(width);
    cssWidthRef.current = catalogWidth;
    setTicketGridLayout(width);
    setSdrLayoutCssWidth(catalogWidth);
    syncDisplayScaleForDevice();
    syncPaintScaleForDevice();
    setLayoutWidth(getCatalogLayoutWidth(width));
    const vh = getCatalogViewportHeight(catalogWidth);
    viewportHeightRef.current = vh;
    setViewportHeight(vh);
    setCanvasGridModeState(isCanvasGridMode(catalogWidth));
    const modeChanged = prevMobile !== isMobileTicketLayout();
    layoutModeRef.current = isMobileTicketLayout();
    if (modeChanged) {
      resetHybridTicketRenderCaches();
      constrainedCanvasPaintedRef.current = false;
    }
    return modeChanged;
  }, []);

  const setTileCanvasRef = useCallback((index: number, el: HTMLCanvasElement | null) => {
    tileCanvasRefs.current[index] = el;
    if (!el) return;
    const animating = modeRef.current === "animating";
    if (el.width > 1 && el.height > 1) {
      el.style.opacity = animating ? "0" : "1";
      el.style.visibility = animating ? "hidden" : "visible";
    }
  }, []);

  const ensureCanvasTilesVisible = useCallback(() => {
    const animating = modeRef.current === "animating";
    for (const tile of tileCanvasRefs.current) {
      if (!tile || tile.width <= 1 || tile.height <= 1) continue;
      tile.style.opacity = animating ? "0" : "1";
      tile.style.visibility = animating ? "hidden" : "visible";
    }
  }, []);

  const waitForTileCanvases = useCallback(async (expectedTiles: number) => {
    for (let attempt = 0; attempt < 64; attempt++) {
      const count = tileCanvasRefs.current.filter(
        (c): c is HTMLCanvasElement => c !== null,
      ).length;
      if (count >= expectedTiles) {
        return tileCanvasRefs.current.filter(
          (c): c is HTMLCanvasElement => c !== null,
        );
      }
      await yieldFrame();
    }
    return tileCanvasRefs.current.filter(
      (c): c is HTMLCanvasElement => c !== null,
    );
  }, []);

  const setDomOverlayVisible = useCallback((visible: boolean) => {
    const el = domOverlayRef.current;
    if (!el) return;
    el.style.visibility = visible ? "visible" : "hidden";
    el.style.display = visible ? "block" : "none";
  }, []);

  const setModeImperative = useCallback(
    (next: GridMode) => {
      if (modeRef.current === next) return;
      modeRef.current = next;
      const tiles = tileCanvasRefs.current;
      for (const tile of tiles) {
        if (!tile) continue;
        const animating = next === "animating";
        tile.style.opacity = animating ? "0" : "1";
        tile.style.visibility = animating ? "hidden" : "visible";
      }
      const anim = animCanvasRef.current;
      if (anim) anim.style.opacity = next === "animating" ? "1" : "0";
      if (next === "animating") {
        if (animCanvasOnlyRef.current) {
          setDomOverlayVisible(false);
        } else if (isDomGridMode(cssWidthRef.current)) {
          setDomOverlayVisible(true);
        } else {
          setDomOverlayVisible(false);
        }
      } else if (next === "idle" && isDomGridMode(cssWidthRef.current)) {
        setDomOverlayVisible(true);
      }
      onModeChange?.(next);
    },
    [onModeChange, setDomOverlayVisible],
  );

  const syncTicketsFromStoreRefs = useCallback(() => {
    ticketsRef.current = getTicketsFromStore();
    ticketByIdRef.current = new Map(ticketsRef.current.map((t) => [t.id, t]));
    ticketCountRef.current = ticketsRef.current.length;
    storeVersionRef.current += 1;
  }, []);

  const commitGridUiState = useCallback(() => {
    const count = ticketCountRef.current;
    const cssWidth = cssWidthRef.current;
    setTicketCount(count);
    setContentHeight(count > 0 ? getContentHeight(count) : 0);
    setTileCount(
      isCanvasGridMode(cssWidthRef.current) && count > 0
        ? computeSdrTileCount(count, getSdrCompositorScale(), cssWidth)
        : 0,
    );
  }, []);

  const syncTicketsFromStore = useCallback(() => {
    syncTicketsFromStoreRefs();
    commitGridUiState();
  }, [commitGridUiState, syncTicketsFromStoreRefs]);

  useEffect(() => {
    let cancelled = false;
    ensureGridTicketFontsReady()
      .then(() => ensureHybridTicketRenderReady())
      .then(() => document.fonts.ready)
      .then(() => {
        if (!cancelled) fontsReadyRef.current = true;
        syncTicketsFromStore();
        void ensureTicketDisplayFontAtlases();
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(
            () => {
              scheduleWarmHybridDigitSprites(60);
              if (isCanvasGridMode(cssWidthRef.current)) {
                void prefetchHybridTextSprites(getPoolTicketsForWarm(120), {
                  chunkSize: 12,
                });
              }
            },
            { timeout: 12_000 },
          );
        }
      })
      .catch(() => {
        if (!cancelled) fontsReadyRef.current = true;
        syncTicketsFromStore();
      });
    return () => {
      cancelled = true;
    };
  }, [syncTicketsFromStore]);

  const applyPoolEntriesImperative = useCallback((indices?: readonly number[]) => {
    const entries = domPoolEntriesRef.current;
    if (indices) {
      for (const i of indices) {
        poolSlotRefs.current[i]?.applyEntry(entries[i]);
      }
      return;
    }
    for (let i = 0; i < HYBRID_DOM_OVERLAY_POOL_SIZE; i++) {
      poolSlotRefs.current[i]?.applyEntry(entries[i]);
    }
  }, []);

  const ensureDomPoolMounted = useCallback(async () => {
    if (domPoolMountCompleteRef.current) return;
    if (domPoolMountPromiseRef.current) {
      await domPoolMountPromiseRef.current;
      return;
    }

    domPoolMountPromiseRef.current = new Promise<void>((resolve) => {
      domPoolMountResolveRef.current = resolve;
    });

    if (!domPoolReadyRef.current) {
      domPoolReadyRef.current = true;
      setDomPoolReady(true);
    }

    await domPoolMountPromiseRef.current;
  }, []);

  useEffect(() => {
    if (!domPoolReady || domPoolMountCompleteRef.current) return;

    let cancelled = false;

    const mountPoolSlots = async () => {
      for (let attempt = 0; attempt < 32; attempt++) {
        if (cancelled) return;
        if (domOverlayRef.current) break;
        await yieldFrame();
      }

      const overlay = domOverlayRef.current;
      if (!overlay || cancelled) return;

      DomPoolSlot.initTemplate();
      const slots: DomPoolSlot[] = [];

      for (
        let start = 0;
        start < HYBRID_DOM_OVERLAY_POOL_SIZE;
        start += DOM_POOL_MOUNT_BATCH_SIZE
      ) {
        if (cancelled) return;
        const end = Math.min(
          start + DOM_POOL_MOUNT_BATCH_SIZE,
          HYBRID_DOM_OVERLAY_POOL_SIZE,
        );
        for (let i = start; i < end; i++) {
          const slot = new DomPoolSlot();
          slots[i] = slot;
          overlay.appendChild(slot.dom);
        }
        if (end < HYBRID_DOM_OVERLAY_POOL_SIZE) {
          await yieldFrame();
        }
      }

      if (cancelled) return;

      poolSlotRefs.current = slots;
      domPoolMountCompleteRef.current = true;
      domPoolMountPromiseRef.current = null;
      applyPoolEntriesImperative();
      domPoolMountResolveRef.current?.();
      domPoolMountResolveRef.current = null;
    };

    void mountPoolSlots();

    return () => {
      cancelled = true;
    };
  }, [domPoolReady, domPoolGeneration, applyPoolEntriesImperative]);

  useEffect(() => {
    return () => {
      const overlay = domOverlayRef.current;
      if (overlay) {
        while (overlay.firstChild) {
          overlay.removeChild(overlay.firstChild);
        }
      }
      poolSlotRefs.current = [];
    };
  }, []);

  const clearCanvasElement = useCallback((canvas: HTMLCanvasElement) => {
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = "0";
    canvas.style.height = "0";
    canvas.style.visibility = "hidden";
    canvas.getContext("2d")?.clearRect(0, 0, 1, 1);
  }, []);

  const clearAllTileCanvases = useCallback(() => {
    for (const canvas of tileCanvasRefs.current) {
      if (canvas) clearCanvasElement(canvas);
    }
    const anim = animCanvasRef.current;
    if (anim) clearCanvasElement(anim);
    tileWindowRef.current = null;
  }, [clearCanvasElement]);

  const resetDomPoolCompletely = useCallback(() => {
    domPoolMountCompleteRef.current = false;
    domPoolMountPromiseRef.current = null;
    domPoolMountResolveRef.current = null;
    domOverlayActiveRef.current = false;
    setDomOverlayVisible(false);
    onDomOverlayChange?.({ active: false, domNodeCount: 0 });
    const overlay = domOverlayRef.current;
    if (overlay) {
      while (overlay.firstChild) {
        overlay.removeChild(overlay.firstChild);
      }
    }
    poolSlotRefs.current = [];
    const entries = domPoolEntriesRef.current;
    for (let i = 0; i < HYBRID_DOM_OVERLAY_POOL_SIZE; i++) {
      entries[i].active = false;
    }
    setDomPoolGeneration((g) => g + 1);
  }, [onDomOverlayChange, setDomOverlayVisible]);

  const resetGridState = useCallback(() => {
    bumpGridEpoch();
    tallPaintGenRef.current += 1;
    paintAbortRef.current?.abort();
    paintAbortRef.current = null;
    if (animationRafRef.current !== null) {
      cancelAnimationFrame(animationRafRef.current);
      animationRafRef.current = null;
    }
    animationRef.current = null;
    if (storeSyncCoalesceRef.current) {
      clearTimeout(storeSyncCoalesceRef.current);
      storeSyncCoalesceRef.current = null;
    }
    coalescedPaintPendingRef.current = false;
    coalescedPaintRunningRef.current = false;
    reconcilePendingRef.current = false;
    reconcileRunningRef.current = false;
    layoutRef.current = [];
    isScrollingRef.current = false;
    scrollTopRef.current = 0;
    constrainedCanvasPaintedRef.current = false;
    domScrollBandKeyRef.current = -1;
    scrollTileBandKeyRef.current = -1;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);
    if (scrollMetricsTimerRef.current) clearTimeout(scrollMetricsTimerRef.current);
    clearAllTileCanvases();
    resetDomPoolCompletely();
    setModeImperative("idle");
  }, [bumpGridEpoch, clearAllTileCanvases, resetDomPoolCompletely, setModeImperative]);

  const paintTallCanvas = useCallback(
    async (options: PaintTallOptions = {}): Promise<boolean> => {
    if (!isCanvasGridMode(cssWidthRef.current)) {
      clearAllTileCanvases();
      onStatusText?.("DOM grid · native tickets");
      return true;
    }

    const container = scrollRef.current;
    if (!container || !fontsReadyRef.current) return false;

    const cssWidth = cssWidthRef.current || getDrawableWidth(container);
    if (cssWidth <= 0) return false;
    cssWidthRef.current = cssWidth;
    applyDrawableWidth(cssWidth);

    const list = ticketsRef.current;
    const layout = layoutRef.current;

    if (list.length === 0 || layout.length === 0) {
      clearAllTileCanvases();
      onPaintProgress?.(0, 0);
      onStatusText?.("Hybrid · idle");
      return true;
    }

    const ticketCount = list.length;
    const total = layout.length;

    if (!coalescedPaintRunningRef.current) {
      paintAbortRef.current?.abort();
    }
    const controller = new AbortController();
    paintAbortRef.current = controller;
    const generation = ++tallPaintGenRef.current;

    const compositorScale = getSdrCompositorScale();
    const expectedTiles = computeSdrTileCount(ticketCount, compositorScale, cssWidth);
    const tileCanvases = await waitForTileCanvases(expectedTiles);

    // Device-adaptive virtualization. When the resident-tile budget covers the
    // whole grid (desktop), activeTileRange is undefined → every tile stays
    // resident and scrolling stays zero-paint. On constrained devices only the
    // viewport window is sized; the rest are released by the paint pass.
    const residentBudget = resolveResidentTileBudgetForGrid(
      ticketCount,
      compositorScale,
      cssWidth,
    );
    const virtualize = residentBudget < expectedTiles;
    const activeTileRange = virtualize
      ? computeVisibleTileRange(
          scrollTopRef.current,
          viewportHeightRef.current,
          ticketCount,
          compositorScale,
          residentBudget,
          cssWidth,
        )
      : undefined;
    tileWindowRef.current = activeTileRange ?? null;

    onPaintProgress?.(0, total);
    onStatusText?.("Compositing hybrid tiles…");

    const isFullGrid = !options.rowRange;
    const chunkSize = isFullGrid
      ? isConstrainedDevice()
        ? CONSTRAINED_PAINT_CHUNK_SIZE
        : total
      : Math.min(total, isConstrainedDevice() ? CONSTRAINED_PAINT_CHUNK_SIZE : 64);

    let ok = await paintTiledTallCanvasSdrChunked({
      tileCanvases,
      cssWidth,
      ticketCount,
      layout,
      tickets: list,
      chunkSize,
      signal: controller.signal,
      rowRange: options.rowRange,
      fullClear: options.fullClear ?? isFullGrid,
      activeTileRange,
      onProgress: isFullGrid
        ? undefined
        : (painted, t) => {
            if (generation !== tallPaintGenRef.current) return;
            onPaintProgress?.(painted, t);
          },
    });

    if ((!ok || generation !== tallPaintGenRef.current) && isFullGrid) {
      const retryTiles = await waitForTileCanvases(expectedTiles);
      ok = await paintTiledTallCanvasSdrChunked({
        tileCanvases: retryTiles,
        cssWidth,
        ticketCount,
        layout,
        tickets: list,
        chunkSize: isConstrainedDevice() ? CONSTRAINED_PAINT_CHUNK_SIZE : total,
        signal: controller.signal,
        fullClear: true,
        activeTileRange,
        onProgress: (painted, t) => {
          if (generation !== tallPaintGenRef.current) return;
          onPaintProgress?.(painted, t);
        },
      });
    }

    if (ok && generation === tallPaintGenRef.current) {
      const residentLabel = activeTileRange
        ? `${activeTileRange.end - activeTileRange.start}/${expectedTiles}`
        : `${expectedTiles}`;
      onStatusText?.(
        `SDR ${compositorScale}× · ${residentLabel} tile(s) · ${total} tickets`,
      );
      constrainedCanvasPaintedRef.current = true;
      ensureCanvasTilesVisible();
      if (isConstrainedDevice() && domOverlayActiveRef.current) {
        domOverlayActiveRef.current = false;
        setDomOverlayVisible(false);
        onDomOverlayChange?.({ active: false, domNodeCount: 0 });
        for (let i = 0; i < HYBRID_DOM_OVERLAY_POOL_SIZE; i++) {
          const entry = domPoolEntriesRef.current[i];
          if (entry.active) {
            entry.active = false;
            poolSlotRefs.current[i]?.applyEntry(entry);
          }
        }
      }
      if (modeRef.current !== "animating" && modeRef.current !== "scrolling") {
        setModeImperative("idle");
      }
    }

    return ok && generation === tallPaintGenRef.current;
  },
    [
      applyDrawableWidth,
      clearAllTileCanvases,
      ensureCanvasTilesVisible,
      onDomOverlayChange,
      onPaintProgress,
      onStatusText,
      setDomOverlayVisible,
      setModeImperative,
      waitForTileCanvases,
    ],
  );

  const rebindDomPoolCore = useCallback(
    (options?: { allowWhileScrolling?: boolean; force?: boolean }): boolean => {
      if (addAnimationActiveRef.current) return false;
      if (animationRef.current) return false;
      if (!options?.allowWhileScrolling && isScrollingRef.current) return false;
      if (ticketsRef.current.length === 0) return false;
      if (!domPoolMountCompleteRef.current) return false;

      const scrollTop = scrollTopRef.current;
      const slots = getVisibleDomSlots(layoutRef.current, scrollTop, viewportHeightRef.current);

      const { activeCount, changed, changedIndices } = updateDomPoolEntriesInPlace(
        domPoolEntriesRef.current,
        slots,
        ticketByIdRef.current,
      );

      const indicesToApply = options?.force
        ? Array.from({ length: getActiveDomPoolSlotCount() }, (_, i) => i)
        : changedIndices;

      if (options?.force || changed) {
        for (const i of indicesToApply) {
          poolSlotRefs.current[i]?.cancelAnimations();
        }
        applyPoolEntriesImperative(indicesToApply);
        onDomOverlayChange?.({ active: true, domNodeCount: activeCount });
      }

      if (isDomGridMode(cssWidthRef.current) && activeCount > 0) {
        domOverlayActiveRef.current = true;
        setDomOverlayVisible(true);
      } else if (!domOverlayActiveRef.current) {
        domOverlayActiveRef.current = true;
        setDomOverlayVisible(true);
      }

      domScrollBandKeyRef.current = getDomScrollBandKey(
        scrollTop,
        viewportHeightRef.current,
      );

      return options?.force || changed;
    },
    [applyPoolEntriesImperative, onDomOverlayChange, setDomOverlayVisible],
  );

  const rebindDomPool = useCallback(
    async (options?: { allowWhileScrolling?: boolean; force?: boolean }) => {
      if (animationRef.current) return;
      if (!options?.allowWhileScrolling && isScrollingRef.current) return;
      if (ticketsRef.current.length === 0) return;

      await ensureDomPoolMounted();
      rebindDomPoolCore(options);
    },
    [ensureDomPoolMounted, rebindDomPoolCore],
  );

  const hideDomOverlay = useCallback(() => {
    if (isDomGridMode(cssWidthRef.current)) return;
    if (!domOverlayActiveRef.current) return;
    domOverlayActiveRef.current = false;
    setDomOverlayVisible(false);
    onDomOverlayChange?.({ active: false, domNodeCount: 0 });
    for (let i = 0; i < HYBRID_DOM_OVERLAY_POOL_SIZE; i++) {
      const entry = domPoolEntriesRef.current[i];
      if (entry.active) {
        entry.active = false;
        poolSlotRefs.current[i]?.applyEntry(entry);
      }
    }
  }, [onDomOverlayChange, setDomOverlayVisible]);

  const hideDomOverlayIfCanvasCovers = useCallback(() => {
    if (!domOverlayActiveRef.current) return;
    if (!tileWindowRef.current) {
      hideDomOverlay();
      return;
    }
    const list = ticketsRef.current;
    const cssWidth = cssWidthRef.current;
    if (list.length === 0 || cssWidth <= 0) return;

    const compositorScale = getSdrCompositorScale();
    if (
      !viewportNeedsCanvasTiles(
        tileCanvasRefs.current,
        scrollTopRef.current,
        viewportHeightRef.current,
        list.length,
        compositorScale,
        cssWidth,
      )
    ) {
      hideDomOverlay();
    }
  }, [hideDomOverlay]);

  /**
   * Incremental tile virtualization — paint new tiles before releasing old ones.
   */
  const reconcileTileWindow = useCallback(async () => {
    if (!tileWindowRef.current) return;
    if (animationRef.current || coalescedPaintRunningRef.current) return;
    if (!fontsReadyRef.current || !scrollRef.current) return;

    if (reconcileRunningRef.current) {
      reconcilePendingRef.current = true;
      return;
    }

    reconcileRunningRef.current = true;
    try {
      do {
        reconcilePendingRef.current = false;

        const list = ticketsRef.current;
        const layout = layoutRef.current;
        const cssWidth = cssWidthRef.current;
        if (list.length === 0 || layout.length === 0 || cssWidth <= 0) break;

        const compositorScale = getSdrCompositorScale();
        const next = computeVisibleTileRange(
          scrollTopRef.current,
          viewportHeightRef.current,
          list.length,
          compositorScale,
          resolveResidentTileBudgetForGrid(list.length, compositorScale, cssWidth),
          cssWidth,
        );
        const prev = tileWindowRef.current;
        if (prev && prev.start === next.start && prev.end === next.end) break;

        const tiles = tileCanvasRefs.current;

        const entered = new Set<number>();
        for (let i = next.start; i < next.end; i++) {
          const inPrev = prev ? i >= prev.start && i < prev.end : false;
          if (!inPrev) entered.add(i);
        }

        if (entered.size > 0) {
          const tileCanvases = tiles.filter(
            (c): c is HTMLCanvasElement => c !== null,
          );

          await paintTiledTallCanvasSdrChunked({
            tileCanvases,
            cssWidth,
            ticketCount: list.length,
            layout,
            tickets: list,
            chunkSize: isConstrainedDevice() ? CONSTRAINED_PAINT_CHUNK_SIZE : 48,
            fullClear: true,
            paintTileIndices: entered,
          });
          ensureCanvasTilesVisible();
        }

        tileWindowRef.current = next;

        for (let i = 0; i < tiles.length; i++) {
          const inNext = i >= next.start && i < next.end;
          if (!inNext) {
            const c = tiles[i];
            if (c) clearCanvasElement(c);
          }
        }

        hideDomOverlayIfCanvasCovers();
      } while (reconcilePendingRef.current);
    } finally {
      reconcileRunningRef.current = false;
    }
  }, [clearCanvasElement, ensureCanvasTilesVisible, hideDomOverlayIfCanvasCovers]);

  const scheduleScrollDomRebind = useCallback(() => {
    if (scrollDomRafRef.current !== null) return;
    scrollDomRafRef.current = requestAnimationFrame(() => {
      scrollDomRafRef.current = null;
      if (!domPoolMountCompleteRef.current) {
        void rebindDomPool({ allowWhileScrolling: true });
        return;
      }
      rebindDomPoolCore({ allowWhileScrolling: true });
    });
  }, [rebindDomPool, rebindDomPoolCore]);

  const scheduleScrollTileReconcile = useCallback(() => {
    if (scrollTileRafRef.current !== null) return;
    scrollTileRafRef.current = requestAnimationFrame(() => {
      scrollTileRafRef.current = null;
      void reconcileTileWindow();
    });
  }, [reconcileTileWindow]);

  /**
   * Virtualized scroll cover — DOM fills gaps while canvas tiles paint ahead.
   * Row-band keyed so DOM work only runs when the buffered slice shifts.
   */
  const syncScrollCoverLayer = useCallback(() => {
    if (!isCanvasGridMode(cssWidthRef.current)) return;
    if (!tileWindowRef.current || animationRef.current) return;

    const list = ticketsRef.current;
    const cssWidth = cssWidthRef.current;
    if (list.length === 0 || cssWidth <= 0) return;

    const compositorScale = getSdrCompositorScale();
    const budget = resolveResidentTileBudgetForGrid(
      list.length,
      compositorScale,
      cssWidth,
    );
    const needsCanvas = viewportNeedsCanvasTiles(
      tileCanvasRefs.current,
      scrollTopRef.current,
      viewportHeightRef.current,
      list.length,
      compositorScale,
      cssWidth,
    );

    if (needsCanvas) {
      const bandKey = getDomScrollBandKey(scrollTopRef.current, viewportHeightRef.current);
      if (bandKey !== domScrollBandKeyRef.current) {
        domScrollBandKeyRef.current = bandKey;
        scheduleScrollDomRebind();
      } else if (!domOverlayActiveRef.current) {
        void rebindDomPool({ allowWhileScrolling: true });
      }
    } else {
      hideDomOverlayIfCanvasCovers();
    }

    const tileKey = getScrollTileBandKey(
      scrollTopRef.current,
      viewportHeightRef.current,
      list.length,
      compositorScale,
      budget,
      cssWidth,
    );
    if (tileKey !== scrollTileBandKeyRef.current) {
      scrollTileBandKeyRef.current = tileKey;
      scheduleScrollTileReconcile();
    }
  }, [
    hideDomOverlayIfCanvasCovers,
    rebindDomPool,
    scheduleScrollDomRebind,
    scheduleScrollTileReconcile,
  ]);

  const runAfterTallPaint = useCallback(
    async (onPainted?: () => void, options?: { forceDomRebind?: boolean }) => {
      if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);

      if (isDomGridMode(cssWidthRef.current)) {
        await ensureDomPoolMounted();
        rebindDomPoolCore({
          allowWhileScrolling: true,
          force: options?.forceDomRebind,
        });
        onPainted?.();
        return;
      }

      await paintTallCanvas({ fullClear: true });
      onPainted?.();
    },
    [ensureDomPoolMounted, paintTallCanvas, rebindDomPoolCore],
  );

  /** One full-grid paint per coalesced burst; re-run if adds land during paint (20× CPU safe). */
  const flushCoalescedPaint = useCallback(async () => {
    if (coalescedPaintRunningRef.current) {
      coalescedPaintPendingRef.current = true;
      return;
    }

    coalescedPaintRunningRef.current = true;
    try {
      let ok = false;
      do {
        coalescedPaintPendingRef.current = false;
        const container = scrollRef.current;
        if (container) {
          const w = getDrawableWidth(container);
          if (w > 0) applyDrawableWidth(w);
        }
        commitGridUiState();
        await yieldFrame();
        await yieldFrame();

        if (isDomGridMode(cssWidthRef.current)) {
          await ensureDomPoolMounted();
          rebindDomPoolCore({ allowWhileScrolling: true });
        } else {
          ok = await paintTallCanvas({ fullClear: true });
        }
      } while (coalescedPaintPendingRef.current);

      if (!ok && isCanvasGridMode(cssWidthRef.current)) {
        await paintTallCanvas({ fullClear: true });
      }
    } finally {
      coalescedPaintRunningRef.current = false;
      if (coalescedPaintPendingRef.current) {
        void flushCoalescedPaint();
      }
    }
  }, [applyDrawableWidth, commitGridUiState, ensureDomPoolMounted, paintTallCanvas, rebindDomPoolCore]);

  const paintAnimFrame = useCallback(() => {
    const canvas = animCanvasRef.current;
    const animation = animationRef.current;
    if (!canvas || !animation) return;
    const cssWidth = cssWidthRef.current;
    if (cssWidth <= 0) return;

    const now = performance.now();
    if (isAddAnimation(animation)) {
      paintAddAnimationCanvasSdr({
        canvas,
        cssWidth,
        viewportHeight: viewportHeightRef.current,
        scrollTop: scrollTopRef.current,
        tickets: ticketsRef.current,
        animation,
        now,
      });
      return;
    }

    paintAnimationCanvasSdr({
      canvas,
      cssWidth,
      viewportHeight: viewportHeightRef.current,
      scrollTop: scrollTopRef.current,
      tickets: ticketsRef.current,
      animation,
      now,
    });
  }, []);

  const finishAddAnimation = useCallback(() => {
    const animation = animationRef.current;
    if (!animation || animation.kind !== "add") return;

    animationRef.current = null;
    animCanvasOnlyRef.current = false;
    addAnimationActiveRef.current = false;
    onAnimatingChange?.(false);

    void runAfterTallPaint(
      () => {
        const animCanvas = animCanvasRef.current;
        if (animCanvas) {
          animCanvas.width = 1;
          animCanvas.height = 1;
          animCanvas.getContext("2d")?.clearRect(0, 0, 1, 1);
        }
        setModeImperative("idle");
      },
      { forceDomRebind: true },
    );
  }, [onAnimatingChange, runAfterTallPaint, setModeImperative]);

  const finishAnimation = useCallback(() => {
    const animation = animationRef.current;
    if (!animation || animation.kind !== "shuffle") return;

    const wasDomShuffle = isDomGridMode(cssWidthRef.current);
    animationRef.current = null;
    onAnimatingChange?.(false);

    ticketsRef.current = animation.nextTickets;
    ticketByIdRef.current = new Map(
      animation.nextTickets.map((t) => [t.id, t]),
    );
    TicketStore.replaceTickets(animation.nextTickets);
    layoutRef.current = buildLayout(
      animation.nextTickets,
      buildHybridLayoutConfig(cssWidthRef.current),
    );
    commitGridUiState();

    void runAfterTallPaint(
      () => {
        const animCanvas = animCanvasRef.current;
        if (animCanvas) {
          animCanvas.width = 1;
          animCanvas.height = 1;
          animCanvas.getContext("2d")?.clearRect(0, 0, 1, 1);
        }
        setModeImperative("idle");
      },
      { forceDomRebind: wasDomShuffle },
    );
  }, [commitGridUiState, onAnimatingChange, runAfterTallPaint, setModeImperative]);

  const runAnimationFrame = useCallback(function runAnimationFrame() {
    const animation = animationRef.current;
    if (!animation) return;
    const elapsed = performance.now() - animation.startTime;
    paintAnimFrame();
    const duration =
      animation.kind === "add" ? animation.durationMs : ANIMATION_MS;
    if (elapsed >= duration) {
      if (animation.kind === "add") {
        finishAddAnimation();
      } else {
        finishAnimation();
      }
      animationRafRef.current = null;
      return;
    }
    animationRafRef.current = requestAnimationFrame(runAnimationFrame);
  }, [finishAddAnimation, finishAnimation, paintAnimFrame]);

  const applyShuffleInstant = useCallback(
    (nextTickets: Ticket[]) => {
      ticketsRef.current = nextTickets;
      TicketStore.replaceTickets(nextTickets);
      layoutRef.current = buildLayout(
        nextTickets,
        buildHybridLayoutConfig(cssWidthRef.current),
      );
      commitGridUiState();
      void runAfterTallPaint();
    },
    [commitGridUiState, runAfterTallPaint],
  );

  const startAnimation = useCallback(
    (
      nextTickets: Ticket[],
      transitions: ReorderTransition[],
      easing: ReorderEasing = "cubic",
    ) => {
      void (async () => {
        const cssWidth = cssWidthRef.current;
        const config = buildHybridLayoutConfig(cssWidth);
        const prevLayout = layoutRef.current;
        const nextLayout = buildLayout(nextTickets, config);
        const scrollTop = scrollTopRef.current;

        const viewportTransitions = filterViewportReorderTransitions(
          transitions,
          prevLayout,
          nextLayout,
          scrollTop,
          viewportHeightRef.current,
        );

        if (viewportTransitions.length === 0) {
          applyShuffleInstant(nextTickets);
          return;
        }

        const drawIds = getShuffleDrawIds(
          prevLayout,
          nextLayout,
          scrollTop,
          viewportHeightRef.current,
        );

        if (isDomGridMode(cssWidthRef.current)) {
          if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);

          await ensureDomPoolMounted();

          domOverlayActiveRef.current = true;
          setDomOverlayVisible(true);

          animationRef.current = {
            kind: "shuffle",
            viewportTransitions,
            nextLayout,
            drawIds,
            startTime: performance.now(),
            nextTickets,
            easing,
          };

          setModeImperative("animating");
          onAnimatingChange?.(true);

          await runDomViewportShuffleAnimation({
            drawIds,
            viewportTransitions,
            nextLayout,
            ticketsById: ticketByIdRef.current,
            poolSlots: poolSlotRefs.current,
            scrollTop: scrollTopRef.current,
            viewportHeight: viewportHeightRef.current,
            easing,
          });

          finishAnimation();
          return;
        }

        hideDomOverlay();
        if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);

        await ensureHybridTicketRenderReady();

        const movingTickets = viewportTransitions
          .map((t) => ticketByIdRef.current.get(t.id))
          .filter((t): t is Ticket => t !== undefined);
        void prefetchHybridTextSprites(movingTickets, { chunkSize: 12 });

        const viewportRows = getViewportRowRange(scrollTop, viewportHeightRef.current);
        await paintTallCanvas({ rowRange: viewportRows, fullClear: false });

        animationRef.current = {
          kind: "shuffle",
          viewportTransitions,
          nextLayout,
          drawIds,
          startTime: performance.now(),
          nextTickets,
          easing,
        };

        paintAnimFrame();
        setModeImperative("animating");
        onAnimatingChange?.(true);

        if (animationRafRef.current !== null) {
          cancelAnimationFrame(animationRafRef.current);
        }
        animationRafRef.current = requestAnimationFrame(runAnimationFrame);
      })();
    },
    [
      applyShuffleInstant,
      ensureDomPoolMounted,
      finishAnimation,
      hideDomOverlay,
      onAnimatingChange,
      paintAnimFrame,
      paintTallCanvas,
      runAnimationFrame,
      setDomOverlayVisible,
      setModeImperative,
    ],
  );

  const removeBall = useCallback((ball: number) => {
    if (animationRef.current) return;
    const container = scrollRef.current;
    const cssWidth = container ? getDrawableWidth(container) : cssWidthRef.current;
    if (cssWidth <= 0 || ticketsRef.current.length === 0) return;

    const requestId = ++requestIdRef.current;
    const request: WorkerRequest = {
      type: "compute-reorder",
      requestId,
      prevTickets: ticketsRef.current,
      removedBall: ball,
      cssWidth,
    };
    workerRef.current?.postMessage(request);
  }, []);

  const shuffle = useCallback(() => {
    if (animationRef.current) return;
    const container = scrollRef.current;
    const cssWidth = container ? getDrawableWidth(container) : cssWidthRef.current;
    if (cssWidth <= 0 || ticketsRef.current.length < 2) return;

    const prevTickets = ticketsRef.current;
    const nextTickets = shuffleTickets(prevTickets);
    const transitions = computeReorderTransitions(
      prevTickets,
      nextTickets,
      buildHybridLayoutConfig(cssWidth),
    );
    startAnimation(nextTickets, transitions, "cubic");
  }, [startAnimation]);

  const repaint = useCallback(async (): Promise<void> => {
    commitGridUiState();
    await yieldFrame();
    if (isDomGridMode(cssWidthRef.current)) {
      await ensureDomPoolMounted();
      rebindDomPoolCore({ allowWhileScrolling: true });
      return;
    }
    await paintTallCanvas({ fullClear: true });
  }, [commitGridUiState, ensureDomPoolMounted, paintTallCanvas, rebindDomPoolCore]);

  useImperativeHandle(handleRef, () => ({ removeBall, shuffle, repaint }), [removeBall, shuffle, repaint]);

  useEffect(() => {
    const worker = new Worker(
      new URL("@/workers/ticketLayout.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.requestId !== requestIdRef.current) return;
      startAnimation(msg.nextTickets, msg.transitions);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [startAnimation]);

  const syncLayout = useCallback(
    (list: Ticket[], _prevTickets: Ticket[]): boolean => {
      const width = cssWidthRef.current;
      if (width <= 0) return false;
      const config = buildHybridLayoutConfig(width);
      const currentLayout = layoutRef.current;

      if (
        currentLayout.length === list.length &&
        list.every((t, i) => currentLayout[i]?.id === t.id)
      ) {
        return false;
      }

      layoutRef.current = buildLayout(list, config);
      return true;
    },
    [],
  );

  const handleStoreReset = useCallback(() => {
    syncTicketsFromStore();
    resetGridState();
  }, [resetGridState, syncTicketsFromStore]);

  const startAddAnimation = useCallback(
    async (
      prevTickets: readonly Ticket[],
      prevLayout: readonly TicketSlot[],
      newTicketIds: readonly number[],
    ): Promise<void> => {
      const cssWidth = cssWidthRef.current;
      const config = buildHybridLayoutConfig(cssWidth);
      const nextLayout = layoutRef.current;

      const plan = buildAddAnimationPlan(
        prevTickets,
        ticketsRef.current,
        prevLayout,
        nextLayout,
        newTicketIds,
        config,
        scrollTopRef.current,
        viewportHeightRef.current,
      );

      if (!shouldRunAddAnimation(plan)) {
        animCanvasOnlyRef.current = false;
        addAnimationActiveRef.current = false;
        onAnimatingChange?.(false);
        setModeImperative("idle");
        return;
      }

      await ensureHybridTicketRenderReady();

      const movingTickets = plan.drawIds
        .map((id) => ticketByIdRef.current.get(id))
        .filter((t): t is Ticket => t !== undefined);
      if (movingTickets.length > 0) {
        void prefetchHybridTextSprites(movingTickets, { chunkSize: 16 });
      }

      hideDomOverlay();
      setDomOverlayVisible(false);
      animCanvasOnlyRef.current = true;
      addAnimationActiveRef.current = true;

      animationRef.current = {
        kind: "add",
        shiftTransitions: plan.shiftTransitions,
        enterTicketIds: new Set(plan.enterTicketIds),
        nextLayout,
        drawIds: [...plan.drawIds],
        startTime: performance.now(),
        durationMs: TICKET_ADD_ANIM.DURATION_MS,
        shiftDurationMs: Math.round(TICKET_ADD_ANIM.DURATION_MS * 0.85),
      };

      paintAnimFrame();
      setModeImperative("animating");
      onAnimatingChange?.(true);

      if (animationRafRef.current !== null) {
        cancelAnimationFrame(animationRafRef.current);
      }

      await new Promise<void>((resolve) => {
        const tick = () => {
          const animation = animationRef.current;
          if (!animation || animation.kind !== "add") {
            resolve();
            return;
          }
          const elapsed = performance.now() - animation.startTime;
          paintAnimFrame();
          if (elapsed >= animation.durationMs) {
            finishAddAnimation();
            animationRafRef.current = null;
            resolve();
            return;
          }
          animationRafRef.current = requestAnimationFrame(tick);
        };
        animationRafRef.current = requestAnimationFrame(tick);
      });
    },
    [
      finishAddAnimation,
      hideDomOverlay,
      onAnimatingChange,
      paintAnimFrame,
      setDomOverlayVisible,
      setModeImperative,
    ],
  );

  const syncGridAfterStoreAdd = useCallback(
    async (
      addedCount: number,
      newTicketIds: readonly number[],
      prevTickets: readonly Ticket[],
      prevLayout: readonly TicketSlot[],
    ) => {
      commitGridUiState();

      const container = scrollRef.current;
      if (container) {
        const w = getDrawableWidth(container);
        if (w > 0) applyDrawableWidth(w);
        scrollTopRef.current = 0;
        container.scrollTo({ top: 0, behavior: "instant" });
      }

      await yieldFrame();

      if (addedCount > 0) {
        await startAddAnimation(prevTickets, prevLayout, newTicketIds);
      }

      if (isDomGridMode(cssWidthRef.current)) {
        await ensureDomPoolMounted();
        await rebindDomPool({ allowWhileScrolling: true, force: true });
        return;
      }

      if (addedCount > 0) {
        void prefetchHybridTextSprites(ticketsRef.current.slice(0, addedCount), {
          chunkSize: 24,
        });
      }
    },
    [
      applyDrawableWidth,
      commitGridUiState,
      ensureDomPoolMounted,
      rebindDomPool,
      startAddAnimation,
    ],
  );

  const scheduleStoreSync = useCallback(() => {
    const prevTickets = ticketsRef.current;
    const prevCount = prevTickets.length;

    syncTicketsFromStoreRefs();

    if (ticketsRef.current.length === 0) {
      resetGridState();
      return;
    }

    if (!fontsReadyRef.current) return;
    if (animationRef.current) return;

    const tickets = ticketsRef.current;
    const addedCount = tickets.length - prevCount;
    const width =
      cssWidthRef.current ||
      (scrollRef.current ? getDrawableWidth(scrollRef.current) : 0);
    if (width > 0) cssWidthRef.current = width;

    const prevLayoutSnapshot = layoutRef.current.slice();
    const layoutChanged = syncLayout(tickets, prevTickets);
    if (!layoutChanged && tickets.length === prevCount) return;

    if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);

    if (addedCount > 0) {
      const prevIdSet = new Set(prevTickets.map((t) => t.id));
      const newTicketIds = tickets
        .filter((t) => !prevIdSet.has(t.id))
        .map((t) => t.id);

      void (async () => {
        await syncGridAfterStoreAdd(
          addedCount,
          newTicketIds,
          prevTickets,
          prevLayoutSnapshot,
        );

        if (storeSyncCoalesceRef.current) {
          clearTimeout(storeSyncCoalesceRef.current);
          storeSyncCoalesceRef.current = null;
        }

        if (isCanvasGridMode(cssWidthRef.current)) {
          await flushCoalescedPaint();
          hideDomOverlayIfCanvasCovers();
          return;
        }

        storeSyncCoalesceRef.current = setTimeout(() => {
          storeSyncCoalesceRef.current = null;
          void flushCoalescedPaint();
        }, STORE_SYNC_COALESCE_MS);
      })();

      if (coalescedPaintRunningRef.current) {
        coalescedPaintPendingRef.current = true;
      }
      return;
    }

    if (domOverlayActiveRef.current && isCanvasGridMode(cssWidthRef.current)) {
      hideDomOverlay();
    }

    if (storeSyncCoalesceRef.current) {
      clearTimeout(storeSyncCoalesceRef.current);
      storeSyncCoalesceRef.current = null;
    }

    if (isCanvasGridMode(cssWidthRef.current)) {
      void flushCoalescedPaint();
    } else {
      storeSyncCoalesceRef.current = setTimeout(() => {
        storeSyncCoalesceRef.current = null;
        void flushCoalescedPaint();
      }, STORE_SYNC_COALESCE_MS);
    }

    if (coalescedPaintRunningRef.current) {
      coalescedPaintPendingRef.current = true;
    }
  }, [
    hideDomOverlay,
    hideDomOverlayIfCanvasCovers,
    resetGridState,
    flushCoalescedPaint,
    syncGridAfterStoreAdd,
    syncLayout,
    syncTicketsFromStoreRefs,
  ]);

  useEffect(() => {
    TicketStore.processQueue();

    const onStoreChange = () => scheduleStoreSync();

    const unsubAdd = TicketStore.addEventListener("add", onStoreChange);
    const unsubReplace = TicketStore.addEventListener("replace", () => {
      syncTicketsFromStoreRefs();
      commitGridUiState();
    });
    const unsubReset = TicketStore.addEventListener("reset", handleStoreReset);
    const unsubRemove = TicketStore.addEventListener("remove", onStoreChange);

    syncTicketsFromStore();
    scheduleStoreSync();

    return () => {
      TicketStore.stopQueue();
      unsubAdd();
      unsubReplace();
      unsubReset();
      unsubRemove();
    };
  }, [handleStoreReset, scheduleStoreSync, syncTicketsFromStore]);

  const latest = useRef({
    rebindDomPool,
    hideDomOverlay,
    onScrollMetrics,
    reconcileTileWindow,
    syncScrollCoverLayer,
  });
  useLayoutEffect(() => {
    latest.current = {
      rebindDomPool,
      hideDomOverlay,
      onScrollMetrics,
      reconcileTileWindow,
      syncScrollCoverLayer,
    };
  });

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const width = getDrawableWidth(container);
    if (width > 0) {
      applyDrawableWidth(width);
    }
  }, [applyDrawableWidth]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    applyDrawableWidth(getDrawableWidth(container));

    const observer = new ResizeObserver(() => {
      const nextWidth = getDrawableWidth(container);
      const prevLayoutWidth = cssWidthRef.current;
      const modeChanged = applyDrawableWidth(nextWidth);
      const layoutWidthChanged =
        Math.abs(cssWidthRef.current - prevLayoutWidth) >= 0.5;
      if (ticketsRef.current.length === 0) return;
      if (!modeChanged && !layoutWidthChanged) return;
      if (modeChanged) {
        scrollTopRef.current = 0;
        container.scrollTop = 0;
        domScrollBandKeyRef.current = -1;
        resetDomPoolCompletely();
      }
      const catalogWidth = cssWidthRef.current;
      void (async () => {
        layoutRef.current = buildLayout(
          ticketsRef.current,
          buildHybridLayoutConfig(nextWidth),
        );
        commitGridUiState();
        if (isDomGridMode(catalogWidth)) {
          await ensureDomPoolMounted();
          await rebindDomPool({ allowWhileScrolling: true, force: modeChanged });
          return;
        }
        await resetSdrSpriteCache();
        await paintTallCanvas({ fullClear: true });
      })();
    });
    observer.observe(container);

    let metricsScrolling = false;
    const emitMetrics = (isScrolling: boolean) => {
      const cb = latest.current.onScrollMetrics;
      if (!cb) return;
      const contentH = getContentHeight(ticketsRef.current.length);
      const maxScroll = Math.max(contentH - container.clientHeight, 1);
      cb({
        scrollTop: scrollTopRef.current,
        progress: scrollTopRef.current / maxScroll,
        isScrolling,
      });
    };

    const onScroll = () => {
      scrollTopRef.current = container.scrollTop;

      if (addOverlayTimerRef.current) {
        clearTimeout(addOverlayTimerRef.current);
        addOverlayTimerRef.current = null;
      }

      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        setModeImperative("scrolling");
      }

      if (isCanvasGridMode(cssWidthRef.current)) {
        latest.current.syncScrollCoverLayer();
      } else {
        const bandKey = getDomScrollBandKey(
          scrollTopRef.current,
          viewportHeightRef.current,
        );
        if (bandKey !== domScrollBandKeyRef.current) {
          domScrollBandKeyRef.current = bandKey;
          scheduleScrollDomRebind();
        }
      }

      if (!metricsScrolling) {
        metricsScrolling = true;
        emitMetrics(true);
      }

      if (scrollMetricsTimerRef.current) clearTimeout(scrollMetricsTimerRef.current);
      scrollMetricsTimerRef.current = setTimeout(() => {
        metricsScrolling = false;
        emitMetrics(false);
      }, SCROLL_METRICS_IDLE_MS);

      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        setModeImperative("idle");
        if (!animationRef.current) {
          domScrollBandKeyRef.current = -1;
          scrollTileBandKeyRef.current = -1;
          if (isDomGridMode(cssWidthRef.current)) {
            void latest.current.rebindDomPool();
          }
          if (isCanvasGridMode(cssWidthRef.current) && tileWindowRef.current !== null) {
            void latest.current.reconcileTileWindow();
          }
          if (isCanvasGridMode(cssWidthRef.current)) {
            latest.current.syncScrollCoverLayer();
          }
        }
      }, HYBRID_SCROLL_IDLE_MS);
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
      if (scrollDomRafRef.current !== null) {
        cancelAnimationFrame(scrollDomRafRef.current);
        scrollDomRafRef.current = null;
      }
      if (scrollTileRafRef.current !== null) {
        cancelAnimationFrame(scrollTileRafRef.current);
        scrollTileRafRef.current = null;
      }
      if (scrollMetricsTimerRef.current) clearTimeout(scrollMetricsTimerRef.current);
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);
    };
  }, [applyDrawableWidth, ensureDomPoolMounted, hideDomOverlay, paintTallCanvas, rebindDomPool, resetDomPoolCompletely, scheduleScrollDomRebind, setModeImperative, syncScrollCoverLayer]);

  useEffect(() => {
    return () => {
      if (animationRafRef.current !== null) cancelAnimationFrame(animationRafRef.current);
      paintAbortRef.current?.abort();
    };
  }, []);

  return {
    scrollRef,
    tileCount,
    setTileCanvasRef,
    animCanvasRef,
    contentHeight,
    ticketCount,
    layoutWidth,
    viewportHeight,
    domOverlayRef,
    canvasGridMode: canvasGridModeState,
  };
}

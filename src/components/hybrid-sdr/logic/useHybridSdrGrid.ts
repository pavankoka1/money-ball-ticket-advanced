import { TicketStore } from "@/components/bingo-catalog/store/TicketStore";
import { ensureHybridTicketRenderReady, prefetchHybridTextSprites, scheduleWarmHybridDigitSprites } from "@/components/hybrid-sdr/canvas/hybridTicketRenderer";
import { getPoolTicketsForWarm } from "@/lib/ticketPool";
import { ensureGridTicketFontsReady } from "@/lib/ticketRenderer";
import { ensureTicketDisplayFontAtlases } from "@/lib/ticketDisplayAtlases";
import {
  buildHybridLayoutConfig,
  buildLayout,
  computeReorderTransitions,
  getDrawableWidth,
  shuffleTickets,
  tryPrependLayout,
  type ReorderTransition,
  type TicketSlot,
} from "@/lib/ticketLayout";
import {
  VIEWPORT_HEIGHT,
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
import {
  ANIMATION_MS,
  type ActiveAnimation,
  type ReorderEasing,
} from "../canvas/animation";
import { computeSdrTileCount } from "@/lib/sdrCanvasTiles";
import { getSdrCompositorScale } from "@/lib/sdrDisplayScale";
import { paintAnimationCanvasSdr } from "../canvas/paintAnimationCanvasSdr";
import { paintTiledTallCanvasSdrChunked } from "../canvas/paintTallCanvasSdr";
import { resetSdrSpriteCache } from "../canvas/sdrSprite";
import {
  createInitialDomPoolEntries,
  DOM_POOL_MOUNT_BATCH_SIZE,
  HYBRID_DOM_OVERLAY_POOL_SIZE,
  updateDomPoolEntriesInPlace,
  type DomPoolEntry,
} from "../lib/domPool";
import { getVisibleDomSlots, getViewportRowRange, HYBRID_SCROLL_IDLE_MS } from "../lib/hybridDomSlots";
import { yieldFrame } from "../lib/yieldFrame";

const SCROLL_METRICS_IDLE_MS = 150;
const TICKET_ADD_OVERLAY_DELAY_MS = 200;
/** Coalesce rapid bundle clicks into one paint pass. */
const STORE_SYNC_COALESCE_MS = 72;

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
  domOverlayRef: RefObject<HTMLDivElement | null>;
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
  const animCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  const ticketsRef = useRef<Ticket[]>([]);
  const layoutRef = useRef<TicketSlot[]>([]);
  const scrollTopRef = useRef(0);
  const cssWidthRef = useRef(0);
  const animationRef = useRef<ActiveAnimation | null>(null);
  const animationRafRef = useRef<number | null>(null);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollMetricsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef(false);
  const paintAbortRef = useRef<AbortController | null>(null);
  const tallPaintGenRef = useRef(0);
  const storeSyncCoalesceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coalescedPaintRunningRef = useRef(false);
  const coalescedPaintPendingRef = useRef(false);
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

  const domPoolReadyRef = useRef(false);
  const [domPoolReady, setDomPoolReady] = useState(false);
  const [ticketCount, setTicketCount] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [tileCount, setTileCount] = useState(1);

  const bumpGridEpoch = useCallback(() => {
    gridEpochRef.current += 1;
    return gridEpochRef.current;
  }, []);

  const setTileCanvasRef = useCallback((index: number, el: HTMLCanvasElement | null) => {
    tileCanvasRefs.current[index] = el;
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
        setDomOverlayVisible(false);
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
    setTicketCount(count);
    setContentHeight(count > 0 ? getContentHeight(count) : 0);
    setTileCount(
      count > 0
        ? computeSdrTileCount(count, getSdrCompositorScale())
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
              void prefetchHybridTextSprites(getPoolTicketsForWarm(120), {
                chunkSize: 12,
              });
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

  const applyPoolEntriesImperative = useCallback(() => {
    const entries = domPoolEntriesRef.current;
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
  }, [domPoolReady, applyPoolEntriesImperative]);

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
  }, [clearCanvasElement]);

  const resetDomPoolCompletely = useCallback(() => {
    domPoolMountCompleteRef.current = false;
    domPoolMountPromiseRef.current = null;
    domPoolMountResolveRef.current = null;
    domPoolReadyRef.current = false;
    setDomPoolReady(false);
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
    layoutRef.current = [];
    isScrollingRef.current = false;
    scrollTopRef.current = 0;
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
    const container = scrollRef.current;
    if (!container || !fontsReadyRef.current) return false;

    const cssWidth = cssWidthRef.current || getDrawableWidth(container);
    if (cssWidth <= 0) return false;
    cssWidthRef.current = cssWidth;

    const list = ticketsRef.current;
    const layout = layoutRef.current;

    if (list.length === 0 || layout.length === 0) {
      clearAllTileCanvases();
      onPaintProgress?.(0, 0);
      onStatusText?.("Hybrid · idle");
      return true;
    }

    paintAbortRef.current?.abort();
    const controller = new AbortController();
    paintAbortRef.current = controller;
    const generation = ++tallPaintGenRef.current;

    const ticketCount = list.length;
    const total = layout.length;
    const expectedTiles = computeSdrTileCount(ticketCount, getSdrCompositorScale());
    const tileCanvases = await waitForTileCanvases(expectedTiles);

    onPaintProgress?.(0, total);
    onStatusText?.("Compositing hybrid tiles…");

    const isFullGrid = !options.rowRange;
    const chunkSize = isFullGrid ? total : Math.min(total, 64);

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
        chunkSize: total,
        signal: controller.signal,
        fullClear: true,
        onProgress: (painted, t) => {
          if (generation !== tallPaintGenRef.current) return;
          onPaintProgress?.(painted, t);
        },
      });
    }

    if (ok && generation === tallPaintGenRef.current) {
      onStatusText?.(
        `SDR ${getSdrCompositorScale()}× · ${tileCanvases.length} tile(s) · ${total} tickets`,
      );
    }

    return ok && generation === tallPaintGenRef.current;
  },
    [clearAllTileCanvases, onPaintProgress, onStatusText, waitForTileCanvases],
  );

  const rebindDomPool = useCallback(
    async (options?: { allowWhileScrolling?: boolean }) => {
      if (animationRef.current) return;
      if (!options?.allowWhileScrolling && isScrollingRef.current) return;
      if (ticketsRef.current.length === 0) return;

      await ensureDomPoolMounted();

      const scrollTop = scrollTopRef.current;
      const slots = getVisibleDomSlots(layoutRef.current, scrollTop, VIEWPORT_HEIGHT);

      const { activeCount, changed } = updateDomPoolEntriesInPlace(
        domPoolEntriesRef.current,
        slots,
        ticketByIdRef.current,
      );

      if (changed) {
        applyPoolEntriesImperative();
      }

      domOverlayActiveRef.current = true;
      setDomOverlayVisible(true);
      onDomOverlayChange?.({ active: true, domNodeCount: activeCount });
    },
    [applyPoolEntriesImperative, ensureDomPoolMounted, onDomOverlayChange, setDomOverlayVisible],
  );

  const hideDomOverlay = useCallback(() => {
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

  const runAfterTallPaint = useCallback(
    async (onPainted?: () => void) => {
      if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);

      await paintTallCanvas({ fullClear: true });
      onPainted?.();

      if (!domOverlayActiveRef.current && !animationRef.current && !isScrollingRef.current) {
        addOverlayTimerRef.current = setTimeout(() => {
          addOverlayTimerRef.current = null;
          void rebindDomPool({ allowWhileScrolling: true });
        }, TICKET_ADD_OVERLAY_DELAY_MS);
      }
    },
    [paintTallCanvas, rebindDomPool],
  );

  /** One full-grid paint per coalesced burst; re-run if adds land during paint (20× CPU safe). */
  const flushCoalescedPaint = useCallback(async () => {
    if (coalescedPaintRunningRef.current) {
      coalescedPaintPendingRef.current = true;
      return;
    }

    coalescedPaintRunningRef.current = true;
    try {
      do {
        coalescedPaintPendingRef.current = false;
        commitGridUiState();
        await yieldFrame();
        await paintTallCanvas({ fullClear: true });
      } while (coalescedPaintPendingRef.current);
    } finally {
      coalescedPaintRunningRef.current = false;
      if (coalescedPaintPendingRef.current) {
        void flushCoalescedPaint();
      }
    }
  }, [commitGridUiState, paintTallCanvas]);

  const paintAnimFrame = useCallback(() => {
    const canvas = animCanvasRef.current;
    const animation = animationRef.current;
    if (!canvas || !animation) return;
    const cssWidth = cssWidthRef.current;
    if (cssWidth <= 0) return;

    paintAnimationCanvasSdr({
      canvas,
      cssWidth,
      viewportHeight: VIEWPORT_HEIGHT,
      scrollTop: scrollTopRef.current,
      layout: layoutRef.current,
      tickets: ticketsRef.current,
      animation,
      now: performance.now(),
    });
  }, []);

  const finishAnimation = useCallback(() => {
    const animation = animationRef.current;
    if (!animation) return;

    animationRef.current = null;
    onAnimatingChange?.(false);

    ticketsRef.current = animation.nextTickets;
    TicketStore.replaceTickets(animation.nextTickets);
    layoutRef.current = buildLayout(
      animation.nextTickets,
      buildHybridLayoutConfig(cssWidthRef.current),
    );
    commitGridUiState();

    void runAfterTallPaint(() => {
      const animCanvas = animCanvasRef.current;
      if (animCanvas) {
        animCanvas.width = 1;
        animCanvas.height = 1;
        animCanvas.getContext("2d")?.clearRect(0, 0, 1, 1);
      }
      setModeImperative("idle");
    });
  }, [commitGridUiState, onAnimatingChange, runAfterTallPaint, setModeImperative]);

  const runAnimationFrame = useCallback(function runAnimationFrame() {
    const animation = animationRef.current;
    if (!animation) return;
    const elapsed = performance.now() - animation.startTime;
    paintAnimFrame();
    if (elapsed >= ANIMATION_MS) {
      finishAnimation();
      animationRafRef.current = null;
      return;
    }
    animationRafRef.current = requestAnimationFrame(runAnimationFrame);
  }, [finishAnimation, paintAnimFrame]);

  const startAnimation = useCallback(
    (
      nextTickets: Ticket[],
      transitions: ReorderTransition[],
      easing: ReorderEasing = "cubic",
    ) => {
      void (async () => {
        hideDomOverlay();
        if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);

        if (transitions.length === 0) {
          ticketsRef.current = nextTickets;
          TicketStore.replaceTickets(nextTickets);
          layoutRef.current = buildLayout(
            nextTickets,
            buildHybridLayoutConfig(cssWidthRef.current),
          );
          void runAfterTallPaint();
          return;
        }

        await ensureHybridTicketRenderReady();

        const scrollTop = scrollTopRef.current;
        const viewportRows = getViewportRowRange(scrollTop, VIEWPORT_HEIGHT);
        await paintTallCanvas({ rowRange: viewportRows, fullClear: false });

        animationRef.current = {
          transitions,
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
    [hideDomOverlay, onAnimatingChange, paintAnimFrame, paintTallCanvas, runAfterTallPaint, runAnimationFrame, setModeImperative],
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
    await paintTallCanvas({ fullClear: true });
  }, [commitGridUiState, paintTallCanvas]);

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
    (list: Ticket[], prevTickets: Ticket[]): boolean => {
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

      const prepended =
        prevTickets.length > 0 && list.length > prevTickets.length
          ? tryPrependLayout(prevTickets, list, currentLayout, config)
          : null;

      layoutRef.current = prepended ?? buildLayout(list, config);
      return true;
    },
    [],
  );

  const handleStoreReset = useCallback(() => {
    syncTicketsFromStore();
    resetGridState();
  }, [resetGridState, syncTicketsFromStore]);

  const showDomOverlayImmediate = useCallback(async (addedCount: number) => {
    commitGridUiState();
    await yieldFrame();

    if (addedCount > 0) {
      const newTickets = ticketsRef.current.slice(0, addedCount);
      void prefetchHybridTextSprites(newTickets, { chunkSize: 24 });
    }

    await ensureDomPoolMounted();
    await rebindDomPool({ allowWhileScrolling: true });
  }, [commitGridUiState, ensureDomPoolMounted, rebindDomPool]);

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

    const layoutChanged = syncLayout(tickets, prevTickets);
    if (!layoutChanged && tickets.length === prevCount) return;

    if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);

    if (addedCount > 0) {
      void showDomOverlayImmediate(addedCount);
    } else if (domOverlayActiveRef.current) {
      hideDomOverlay();
    }

    if (storeSyncCoalesceRef.current) {
      clearTimeout(storeSyncCoalesceRef.current);
    }
    storeSyncCoalesceRef.current = setTimeout(() => {
      storeSyncCoalesceRef.current = null;
      void flushCoalescedPaint();
    }, STORE_SYNC_COALESCE_MS);

    if (coalescedPaintRunningRef.current) {
      coalescedPaintPendingRef.current = true;
    }
  }, [
    hideDomOverlay,
    resetGridState,
    flushCoalescedPaint,
    showDomOverlayImmediate,
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

  const latest = useRef({ rebindDomPool, hideDomOverlay, onScrollMetrics });
  useLayoutEffect(() => {
    latest.current = { rebindDomPool, hideDomOverlay, onScrollMetrics };
  });

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    cssWidthRef.current = getDrawableWidth(container);

    const observer = new ResizeObserver(() => {
      const nextWidth = getDrawableWidth(container);
      if (Math.abs(nextWidth - cssWidthRef.current) < 0.5) return;
      cssWidthRef.current = nextWidth;
      if (ticketsRef.current.length === 0) return;
      void resetSdrSpriteCache().then(() => {
        layoutRef.current = buildLayout(
          ticketsRef.current,
          buildHybridLayoutConfig(nextWidth),
        );
        void paintTallCanvas({ fullClear: true }).then(() => {
          void latest.current.rebindDomPool({ allowWhileScrolling: true });
        });
      });
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
        modeRef.current = "scrolling";
      }

      if (domOverlayActiveRef.current) {
        latest.current.hideDomOverlay();
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
        modeRef.current = "idle";
        if (!animationRef.current) {
          void latest.current.rebindDomPool();
        }
      }, HYBRID_SCROLL_IDLE_MS);
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
      if (scrollMetricsTimerRef.current) clearTimeout(scrollMetricsTimerRef.current);
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      if (addOverlayTimerRef.current) clearTimeout(addOverlayTimerRef.current);
    };
  }, [hideDomOverlay, paintTallCanvas]);

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
    domOverlayRef,
  };
}

import { isDomGridMode } from "@/lib/gridRendererMode";
import type { RefObject } from "react";

type TallGridDomOverlayPoolProps = {
  overlayRef: RefObject<HTMLDivElement | null>;
};

export function TallGridDomOverlayPool({
  overlayRef,
}: TallGridDomOverlayPoolProps) {
  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-[2]"
      aria-hidden
      data-hybrid-dom-pool={isDomGridMode() ? "primary" : "scroll-cover"}
      style={{ visibility: "hidden" }}
    />
  );
}

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
      data-hybrid-optimised-overlay
      style={{ visibility: "hidden" }}
    />
  );
}

/** Worker-safe guards — `instanceof HTMLCanvasElement` throws when the global is missing. */

export function isHtmlCanvas(value: unknown): value is HTMLCanvasElement {
  return (
    typeof HTMLCanvasElement !== "undefined" &&
    value instanceof HTMLCanvasElement
  );
}

export function isImageBitmap(value: unknown): value is ImageBitmap {
  return typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap;
}

export function getCanvasSourceSize(
  source: CanvasImageSource,
  fallbackW: number,
  fallbackH: number,
): { width: number; height: number } {
  if (isImageBitmap(source) || isHtmlCanvas(source)) {
    return { width: source.width, height: source.height };
  }
  return { width: fallbackW, height: fallbackH };
}

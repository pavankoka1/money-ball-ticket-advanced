/**
 * Manual rounded-rectangle paths via quadraticCurveTo.
 * Avoids native roundRect() implementations that can look jagged when clipped or stroked.
 */
export function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Capsule path for 1px-wide dividers — uniform roundRect collapses when w ≤ 2r.
 */
export function traceVerticalCapsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const capR = Math.min(r, w / 2, h / 2);
  const cx = x + w / 2;

  ctx.beginPath();

  if (h <= 2 * capR) {
    ctx.arc(cx, y + h / 2, capR, 0, Math.PI * 2);
    return;
  }

  ctx.arc(cx, y + capR, capR, Math.PI, 0);
  ctx.arc(cx, y + h - capR, capR, 0, Math.PI);
  ctx.closePath();
}

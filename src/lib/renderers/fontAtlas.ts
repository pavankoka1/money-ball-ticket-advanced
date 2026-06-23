import { TICKET_CHARSET, TICKET_TEXT } from "@/lib/ticketDesign";
import { SDF_ATLAS_GENERATION_SCALE } from "@/lib/canvasSetup";
import { isHtmlCanvas, isImageBitmap } from "@/lib/canvasSource";

export type GlyphMetrics = {
  char: string;
  /** UV rect in texture (physical pixels). */
  atlasX: number;
  atlasY: number;
  atlasW: number;
  atlasH: number;
  /** Draw size in logical/CSS pixels. */
  renderW: number;
  renderH: number;
  advance: number;
  bearingX: number;
  /** Distance from quad top to alphabetic baseline. */
  baselineFromCellTop: number;
  /** Distance from quad top to visual ink centre. */
  bearingY: number;
};

export type FontAtlas = {
  texture: HTMLCanvasElement | ImageBitmap;
  textureWidth: number;
  textureHeight: number;
  fontSize: number;
  glyphs: Map<string, GlyphMetrics>;
  /** Pre-tinted glyph cells for crisp Canvas 2D display-scale blits (SDR path). */
  tintedByColor?: Map<string, Map<string, HTMLCanvasElement | OffscreenCanvas>>;
};

export type FontAtlasTransfer = {
  bitmap: ImageBitmap;
  textureWidth: number;
  textureHeight: number;
  fontSize: number;
  glyphs: Record<string, GlyphMetrics>;
};

export function fontAtlasToTransfer(atlas: FontAtlas): FontAtlasTransfer {
  const glyphs: Record<string, GlyphMetrics> = {};
  atlas.glyphs.forEach((glyph, char) => {
    glyphs[char] = glyph;
  });
  if (!isImageBitmap(atlas.texture)) {
    throw new Error("fontAtlasToTransfer expects an ImageBitmap texture");
  }
  return {
    bitmap: atlas.texture,
    textureWidth: atlas.textureWidth,
    textureHeight: atlas.textureHeight,
    fontSize: atlas.fontSize,
    glyphs,
  };
}

export async function createFontAtlasTransfer(
  atlas: FontAtlas,
): Promise<FontAtlasTransfer> {
  const bitmap = await createImageBitmap(atlas.texture);
  const glyphs: Record<string, GlyphMetrics> = {};
  atlas.glyphs.forEach((glyph, char) => {
    glyphs[char] = glyph;
  });
  return {
    bitmap,
    textureWidth: atlas.textureWidth,
    textureHeight: atlas.textureHeight,
    fontSize: atlas.fontSize,
    glyphs,
  };
}

export function fontAtlasFromTransfer(transfer: FontAtlasTransfer): FontAtlas {
  const glyphs = new Map<string, GlyphMetrics>();
  for (const [char, glyph] of Object.entries(transfer.glyphs)) {
    glyphs.set(char, glyph);
  }
  return {
    texture: transfer.bitmap,
    textureWidth: transfer.textureWidth,
    textureHeight: transfer.textureHeight,
    fontSize: transfer.fontSize,
    glyphs,
  };
}

type BuildAtlasOptions = {
  font: string;
  fontSize: number;
  charset?: string;
  scale?: number;
  padding?: number;
};

function waitForFont(font: string) {
  if (typeof document === "undefined") return Promise.resolve();
  return document.fonts.load(font).catch(() => undefined);
}

/**
 * Raster glyph atlas. For ticket WebGL2, pass `scale: resolveTicketChromeRenderScale(dpr)`
 * so texels match the canvas backing store (mirrors Canvas 2D enhanced fillText).
 */
export async function buildBitmapFontAtlas(
  options: BuildAtlasOptions
): Promise<FontAtlas> {
  const {
    font,
    fontSize,
    charset = TICKET_CHARSET,
    scale = 1,
    padding = 2,
  } = options;

  await waitForFont(font);

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("Canvas 2D unavailable");

  measureCtx.font = font;
  const uniqueChars = [...new Set(charset.split(""))];

  const glyphSizes = uniqueChars.map((char) => {
    const metrics = measureCtx.measureText(char);
    const width = Math.ceil(metrics.width) + padding * 2;
    const ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.8;
    const descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.2;
    const height = Math.ceil(ascent + descent) + padding * 2;
    return { char, width, height, advance: metrics.width, ascent, descent };
  });

  const atlasCols = Math.ceil(Math.sqrt(glyphSizes.length));
  const atlasRows = Math.ceil(glyphSizes.length / atlasCols);
  const cellW = Math.max(...glyphSizes.map((g) => g.width), 1);
  const cellH = Math.max(...glyphSizes.map((g) => g.height), 1);

  const textureWidth = atlasCols * cellW * scale;
  const textureHeight = atlasRows * cellH * scale;

  const texture = document.createElement("canvas");
  texture.width = textureWidth;
  texture.height = textureHeight;
  const ctx = texture.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, textureWidth / scale, textureHeight / scale);
  ctx.font = font;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }
  const ctxWithRendering = ctx as CanvasRenderingContext2D & {
    textRendering?: CanvasTextRendering;
  };
  if ("textRendering" in ctxWithRendering) {
    ctxWithRendering.textRendering = "geometricPrecision";
  }

  const glyphs = new Map<string, GlyphMetrics>();

  glyphSizes.forEach((glyph, index) => {
    const col = index % atlasCols;
    const row = Math.floor(index / atlasCols);
    const atlasX = col * cellW;
    const atlasY = row * cellH;
    const drawX = atlasX + padding;
    const drawY = atlasY + padding + glyph.ascent;
    const visualCenterY = padding + (glyph.ascent + glyph.descent) / 2;
    const baselineFromCellTop = padding + glyph.ascent;

    ctx.fillText(glyph.char, drawX, drawY);

    glyphs.set(glyph.char, {
      char: glyph.char,
      atlasX: atlasX * scale,
      atlasY: atlasY * scale,
      atlasW: cellW * scale,
      atlasH: cellH * scale,
      renderW: cellW,
      renderH: cellH,
      advance: glyph.advance,
      bearingX: padding,
      baselineFromCellTop,
      bearingY: visualCenterY,
    });
  });

  return {
    texture,
    textureWidth,
    textureHeight,
    fontSize,
    glyphs,
  };
}

/** Approximate SDF from alpha mask — O(pixels × radius²); keep source textures small. */
function alphaToSdf(
  source: ImageData,
  radius = 12
): Uint8ClampedArray {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(width * height);
  const inside = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    inside[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  }

  const radiusSq = radius * radius;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const isInside = inside[idx] === 1;
      let minDist = radius;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const distSq = dx * dx + dy * dy;
          if (distSq > radiusSq) continue;

          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighborInside = inside[ny * width + nx] === 1;
          if (neighborInside !== isInside) {
            const dist = Math.sqrt(distSq);
            if (dist < minDist) minDist = dist;
          }
        }
      }

      const signed = isInside ? minDist : -minDist;
      const normalized = Math.max(
        0,
        Math.min(255, Math.round((signed / radius + 0.5) * 255))
      );
      out[idx] = normalized;
    }
  }

  return out;
}

type BuildSdfAtlasOptions = BuildAtlasOptions & {
  sdfScale?: number;
};

export async function buildSdfFontAtlas(
  options: BuildSdfAtlasOptions
): Promise<FontAtlas> {
  const sdfScale = options.sdfScale ?? SDF_ATLAS_GENERATION_SCALE;

  // SDF distance field is resolution-independent — never use display supersampling here.
  const bitmap = await buildBitmapFontAtlas({
    font: options.font,
    fontSize: options.fontSize,
    charset: options.charset,
    padding: options.padding,
    scale: sdfScale,
  });

  const sdfCanvas = document.createElement("canvas");
  sdfCanvas.width = bitmap.textureWidth;
  sdfCanvas.height = bitmap.textureHeight;
  const sdfCtx = sdfCanvas.getContext("2d");
  if (!sdfCtx) throw new Error("Canvas 2D unavailable");

  const textureSource = bitmap.texture;
  if (!isHtmlCanvas(textureSource)) {
    throw new Error("SDF atlas requires a canvas texture source");
  }
  const srcCtx = textureSource.getContext("2d");
  if (!srcCtx) throw new Error("Canvas 2D unavailable");

  const imageData = srcCtx.getImageData(
    0,
    0,
    bitmap.textureWidth,
    bitmap.textureHeight
  );
  const sdf = alphaToSdf(imageData, 12);
  const outImage = sdfCtx.createImageData(bitmap.textureWidth, bitmap.textureHeight);

  for (let i = 0; i < sdf.length; i++) {
    const v = sdf[i];
    const o = i * 4;
    outImage.data[o] = v;
    outImage.data[o + 1] = v;
    outImage.data[o + 2] = v;
    outImage.data[o + 3] = 255;
  }

  sdfCtx.putImageData(outImage, 0, 0);

  return {
    ...bitmap,
    texture: sdfCanvas,
  };
}

export function measureTextWidth(atlas: FontAtlas, text: string) {
  let width = 0;
  for (const char of text) {
    const glyph = atlas.glyphs.get(char);
    width += glyph?.advance ?? atlas.fontSize * 0.6;
  }
  return width;
}

type TintScratchCtx =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

let tintScratch: HTMLCanvasElement | OffscreenCanvas | null = null;
let tintScratchCtx: TintScratchCtx | null = null;

function getTintScratch(
  w: number,
  h: number,
): TintScratchCtx | null {
  if (!tintScratch) {
    if (typeof OffscreenCanvas !== "undefined") {
      tintScratch = new OffscreenCanvas(w, h);
    } else if (typeof document !== "undefined") {
      tintScratch = document.createElement("canvas");
    } else {
      return null;
    }
    tintScratchCtx = tintScratch.getContext("2d");
  }
  if (!tintScratchCtx) return null;
  if (tintScratch.width !== w) tintScratch.width = w;
  if (tintScratch.height !== h) tintScratch.height = h;
  return tintScratchCtx;
}

function createBakedGlyphSurface(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof document !== "undefined") {
    const baked = document.createElement("canvas");
    baked.width = w;
    baked.height = h;
    return baked;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  return null;
}

function bakeTintedGlyph(
  atlas: FontAtlas,
  glyph: GlyphMetrics,
  color: string,
): HTMLCanvasElement | OffscreenCanvas | null {
  const w = glyph.atlasW;
  const h = glyph.atlasH;
  const scratchCtx = getTintScratch(w, h);
  if (!scratchCtx || !tintScratch) return null;

  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.globalCompositeOperation = "source-over";
  scratchCtx.clearRect(0, 0, w, h);
  scratchCtx.imageSmoothingEnabled = false;
  scratchCtx.drawImage(
    atlas.texture,
    glyph.atlasX,
    glyph.atlasY,
    w,
    h,
    0,
    0,
    w,
    h,
  );
  scratchCtx.globalCompositeOperation = "source-in";
  scratchCtx.fillStyle = color;
  scratchCtx.fillRect(0, 0, w, h);
  scratchCtx.globalCompositeOperation = "source-over";

  const baked = createBakedGlyphSurface(w, h);
  if (!baked) return null;
  baked.getContext("2d")?.drawImage(tintScratch, 0, 0);
  return baked;
}

function blitTintedGlyph(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  atlas: FontAtlas,
  char: string,
  color: string,
  dx: number,
  dy: number,
): boolean {
  const baked = atlas.tintedByColor?.get(color)?.get(char);
  if (!baked) return false;
  ctx.drawImage(baked, dx, dy);
  return true;
}

/** Tint-on-blit fallback when tinted cache is unavailable (uses isolated scratch). */
function blitTintedGlyphFromTexture(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  atlas: FontAtlas,
  char: string,
  color: string,
  dx: number,
  dy: number,
): boolean {
  const glyph = atlas.glyphs.get(char);
  if (!glyph) return false;

  const baked = bakeTintedGlyph(atlas, glyph, color);
  if (!baked) return false;
  ctx.drawImage(baked, dx, dy);
  return true;
}

/** Bake per-color glyph tiles for nearest-neighbor display blits (stats-bar pattern). */
export function attachTintedGlyphCache(
  atlas: FontAtlas,
  colors: string[],
): FontAtlas {
  if (atlas.tintedByColor) return atlas;

  const tintedByColor = new Map<string, Map<string, HTMLCanvasElement | OffscreenCanvas>>();

  for (const color of colors) {
    const byChar = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
    for (const [char, glyph] of atlas.glyphs) {
      const baked = bakeTintedGlyph(atlas, glyph, color);
      if (baked) byChar.set(char, baked);
    }
    tintedByColor.set(color, byChar);
  }

  atlas.tintedByColor = tintedByColor;
  return atlas;
}

/**
 * Bitmap text on a display backing store at `displayScale` (identity transform).
 * Matches stats `drawStatsLabelBitmapDisplay` — no fillText downsample blur.
 */
export function drawBitmapTextOnDisplay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  atlas: FontAtlas,
  text: string,
  leftX: number,
  baselineY: number,
  color: string,
  displayScale: number,
  originBufferX = 0,
  originBufferY = 0,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const useTintedCache = Boolean(atlas.tintedByColor);
  let cursor = leftX;
  for (const char of text) {
    const glyph = atlas.glyphs.get(char);
    if (!glyph) continue;
    const topLogical = baselineY - glyph.baselineFromCellTop;
    const dx = Math.round(cursor * displayScale) + originBufferX;
    const dy = Math.round(topLogical * displayScale) + originBufferY;
    if (useTintedCache) {
      if (!blitTintedGlyph(ctx, atlas, char, color, dx, dy)) continue;
    } else {
      if (!blitTintedGlyphFromTexture(ctx, atlas, char, color, dx, dy)) continue;
    }
    cursor += glyph.advance;
  }
  ctx.restore();
}

export const BODY_FONT_SPEC = `${TICKET_TEXT.weight} ${TICKET_TEXT.size}px ${TICKET_TEXT.family}`;

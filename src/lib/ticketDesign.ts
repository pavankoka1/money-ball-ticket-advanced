/** Reference ticket — grid-driven dimensions (6×32 + 5×1 = 197). */
export const TICKET_CELL_WIDTH = 32;
export const TICKET_CELL_HEIGHT = 23;
export const TICKET_CELL_COUNT = 6;
export const TICKET_SEPARATOR_COUNT = TICKET_CELL_COUNT - 1;
export const TICKET_SEPARATOR_WIDTH = 1;
export const TICKET_SEPARATOR_HEIGHT = 12;
export const TICKET_SEPARATOR_RADIUS = 2;
export const TICKET_SEPARATOR_COLOR = "rgba(177, 151, 151, 0.50)";

export const TICKET_DESIGN_WIDTH =
  TICKET_CELL_COUNT * TICKET_CELL_WIDTH +
  TICKET_SEPARATOR_COUNT * TICKET_SEPARATOR_WIDTH;

export const TICKET_DESIGN_HEIGHT = 43;
export const TICKET_RADIUS = 5;

/** Mobile Figma ticket — fixed 181×43, centred in the parent (not fluid). */
export const TICKET_MOBILE_DESIGN_WIDTH = 181;

export const TICKET_COLORS = {
  cream: "#f8eadb",
  white: "#ffffff",
  number: "#715050",
  border: "#f3eae0",
} as const;

/** SVG numbers row: linear-gradient(180deg, #FFF 0%, #F3EAE0 100%). */
export const TICKET_NUMBERS_BAND_GRADIENT = {
  top: TICKET_COLORS.white,
  bottom: "#f3eae0",
} as const;

/** Body band height — matches `.domTicketCard__body` (26px). */
export const TICKET_NUMBERS_BAND_HEIGHT = 26;

/**
 * Cream header — matches `.domTicketCard__header` (43 − 26 = 17px).
 * Same token for canvas chrome and DOM.
 */
export const TICKET_HEADER_HEIGHT =
  TICKET_DESIGN_HEIGHT - TICKET_NUMBERS_BAND_HEIGHT;

/** @deprecated Use TICKET_HEADER_HEIGHT — kept for older docs. */
export const TICKET_BODY_HEIGHT = TICKET_CELL_HEIGHT;

/** Body inner padding — matches `.domTicketCard__body` padding. */
export const TICKET_DOM_BODY_PADDING_Y = 1.5;

/** Cell margin-top — matches `.domTicketCard__cell` margin-top. */
export const TICKET_DOM_CELL_MARGIN_TOP = 1;

/** Design token — Onest 18px / 700 at 1× ticket. */
export const TICKET_TEXT = {
  family: "Onest, system-ui, sans-serif",
  size: 18,
  weight: 700,
  color: TICKET_COLORS.number,
} as const;

/** Header ticket id — top-right, right-aligned. */
export const TICKET_ID_TEXT = {
  family: "Onest, system-ui, sans-serif",
  size: 12,
  weight: 700,
  color: "#B19797",
  rightPad: 4,
} as const;

export const TICKET_ID_RIGHT_X = TICKET_DESIGN_WIDTH - TICKET_ID_TEXT.rightPad;

/** Vertical centre of id in 17px header (flex align-items: center). */
export const TICKET_ID_CENTER_Y = TICKET_HEADER_HEIGHT / 2;

/** Top of the numbers band (flush under header). */
export function ticketNumbersBandTop(
  height = TICKET_DESIGN_HEIGHT,
): number {
  return height - TICKET_NUMBERS_BAND_HEIGHT;
}

/** Inner content top inside body padding. */
export function ticketDomBodyContentTop(
  height = TICKET_DESIGN_HEIGHT,
): number {
  return ticketNumbersBandTop(height) + TICKET_DOM_BODY_PADDING_Y;
}

/**
 * Flex-centred body number Y — matches `.domTicketCard__body` (align-items: center)
 * with `.domTicketCard__cell` margin-top shifting the ink centre down by half the margin.
 */
export function ticketDomCellTextCenterY(
  height = TICKET_DESIGN_HEIGHT,
): number {
  const bandTop = ticketNumbersBandTop(height);
  const bandCenterY = bandTop + TICKET_NUMBERS_BAND_HEIGHT / 2;
  return bandCenterY + TICKET_DOM_CELL_MARGIN_TOP / 2;
}

/** Cell border-box top — derived from flex-centred ink Y. */
export function ticketDomCellBorderTop(
  height = TICKET_DESIGN_HEIGHT,
): number {
  return ticketDomCellTextCenterY(height) - TICKET_CELL_HEIGHT / 2;
}

/** @deprecated Use ticketDomCellTextCenterY — canvas/DOM shared centre. */
export const TICKET_BODY_TEXT_VISUAL_Y = ticketDomCellTextCenterY();

/** Horizontal centre for body number `index`. */
export function ticketBodyTextAnchorX(index: number): number {
  return ticketCellCenterX(index);
}

/** Separator inset from band top — centres 12px caps in 26px band. */
export const TICKET_SEPARATOR_BAND_INSET =
  (TICKET_NUMBERS_BAND_HEIGHT - TICKET_SEPARATOR_HEIGHT) / 2;

/** Top edge Y of vertical dividers — centred in body band. */
export function ticketSeparatorY(height = TICKET_DESIGN_HEIGHT): number {
  return ticketNumbersBandTop(height) + TICKET_SEPARATOR_BAND_INSET;
}

export const REFERENCE_TICKET = {
  id: 2,
  values: [29, 3, 5, 15, 9, 10] as const,
};

export const TICKET_CHARSET = "0123456789";

/** Left edge of cell `index` (0-based). */
export function ticketCellOriginX(index: number): number {
  return index * (TICKET_CELL_WIDTH + TICKET_SEPARATOR_WIDTH);
}

/** Horizontal centre of cell `index`. */
export function ticketCellCenterX(index: number): number {
  return ticketCellOriginX(index) + TICKET_CELL_WIDTH / 2;
}

/** Left edge of separator after cell `index` (0–4). */
export function ticketSeparatorX(index: number): number {
  return (index + 1) * TICKET_CELL_WIDTH + index * TICKET_SEPARATOR_WIDTH;
}

/** Flex cell width for tickets narrower than the 197px desktop grid (e.g. 181px mobile). */
export function ticketFlexCellWidth(ticketWidth: number): number {
  const totalSeparatorW = TICKET_SEPARATOR_COUNT * TICKET_SEPARATOR_WIDTH;
  return (ticketWidth - totalSeparatorW) / TICKET_CELL_COUNT;
}

/** Horizontal centre of cell `index` on a flex-width ticket. */
export function ticketFlexCellCenterX(
  index: number,
  ticketWidth: number,
): number {
  const cellW = ticketFlexCellWidth(ticketWidth);
  return index * (cellW + TICKET_SEPARATOR_WIDTH) + cellW / 2;
}

/** Left edge of separator after cell `index` on a flex-width ticket. */
export function ticketFlexSeparatorX(index: number, ticketWidth: number): number {
  const cellW = ticketFlexCellWidth(ticketWidth);
  return (index + 1) * cellW + index * TICKET_SEPARATOR_WIDTH;
}

export function ticketCellCenterXForWidth(
  index: number,
  ticketWidth: number,
): number {
  return ticketWidth === TICKET_DESIGN_WIDTH
    ? ticketCellCenterX(index)
    : ticketFlexCellCenterX(index, ticketWidth);
}

export function ticketSeparatorXForWidth(
  index: number,
  ticketWidth: number,
): number {
  return ticketWidth === TICKET_DESIGN_WIDTH
    ? ticketSeparatorX(index)
    : ticketFlexSeparatorX(index, ticketWidth);
}

export function ticketIdRightXForWidth(ticketWidth: number): number {
  return ticketWidth - TICKET_ID_TEXT.rightPad;
}

export function ticketBodyMetrics(height = TICKET_DESIGN_HEIGHT) {
  const numbersBandTop = ticketNumbersBandTop(height);
  const numbersBandHeight = TICKET_NUMBERS_BAND_HEIGHT;
  const cellCenterY = ticketDomCellTextCenterY(height);
  const separatorY = ticketSeparatorY(height);

  return {
    bodyY: numbersBandTop,
    bodyH: numbersBandHeight,
    cellAreaTop: ticketDomCellBorderTop(height),
    cellCenterY,
    textVisualCenterY: cellCenterY,
    separatorY,
    numbersBandTop,
    numbersBandHeight,
  };
}

export function ticketBodyFont() {
  return `${TICKET_TEXT.weight} ${TICKET_TEXT.size}px ${TICKET_TEXT.family}`;
}

export function ticketIdFont() {
  return `${TICKET_ID_TEXT.weight} ${TICKET_ID_TEXT.size}px ${TICKET_ID_TEXT.family}`;
}

/** Mobile ticket typography — matches Figma / production bingo mobile. */
export const TICKET_MOBILE_TEXT = {
  family: "Onest, system-ui, sans-serif",
  size: 15,
  weight: 700,
  color: "#704F4F",
} as const;

export const TICKET_MOBILE_ID_TEXT = {
  family: "Onest, system-ui, sans-serif",
  size: 10,
  weight: 700,
  color: "#B19797",
  rightPad: 6,
} as const;

export function ticketMobileBodyFont() {
  return `${TICKET_MOBILE_TEXT.weight} ${TICKET_MOBILE_TEXT.size}px ${TICKET_MOBILE_TEXT.family}`;
}

export function ticketMobileIdFont() {
  return `${TICKET_MOBILE_ID_TEXT.weight} ${TICKET_MOBILE_ID_TEXT.size}px ${TICKET_MOBILE_ID_TEXT.family}`;
}


/** Canvas gradient matching SVG `linear-gradient(180deg, #FFF 0%, #F3EAE0 100%)`. */
export function createTicketNumbersBandGradient(
  ctx: CanvasRenderingContext2D,
  bandTop: number,
  bandHeight: number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandHeight);
  gradient.addColorStop(0, TICKET_NUMBERS_BAND_GRADIENT.top);
  gradient.addColorStop(1, TICKET_NUMBERS_BAND_GRADIENT.bottom);
  return gradient;
}

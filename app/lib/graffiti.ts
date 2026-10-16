// The graffiti wall's geometry, shared by the server (which validates placements) and the
// browser (which shows whether a spot is free while you aim). Positions are in grid cells.

/** Size of one grid cell on the wall, in CSS pixels. */
export const CELL_PX = 30;

/** Every piece is the same size, in cells: 240 × 150 CSS pixels on the wall. */
export const PIECE_COLS = 8;
export const PIECE_ROWS = 5;

/** The drawing canvas is twice the on-wall size so pieces stay crisp on dense screens. */
export const CANVAS_WIDTH = PIECE_COLS * CELL_PX * 2;
export const CANVAS_HEIGHT = PIECE_ROWS * CELL_PX * 2;

/** Largest drawing accepted, in bytes of PNG (not of its base64 text). */
export const MAX_PNG_BYTES = 512 * 1024;

/** Roughly how many bytes of PNG a `data:image/png;base64,…` URL holds. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}

/** A fresh wall, in cells, and how much it grows each time it runs out of room. */
export const BASE_COLS = 80;
export const BASE_ROWS = 48;
export const GROW_COLS = 16;
export const GROW_ROWS = 10;

export type Rect = { x: number; y: number; w: number; h: number };
export type WallSize = { cols: number; rows: number };

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function insideWall(r: Rect, size: WallSize): boolean {
  return (
    Number.isInteger(r.x) &&
    Number.isInteger(r.y) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.x + r.w <= size.cols &&
    r.y + r.h <= size.rows
  );
}

/** True when `r` sits fully on the wall and touches no other piece. */
export function canPlace(r: Rect, pieces: readonly Rect[], size: WallSize): boolean {
  return insideWall(r, size) && !pieces.some((p) => overlaps(r, p));
}

/**
 * Builds a lookup that says, in constant time, whether a w × h rectangle at (x, y) is free.
 * Uses a 2-D prefix sum over the occupied cells.
 */
function freeChecker(pieces: readonly Rect[], size: WallSize) {
  const { cols, rows } = size;
  const stride = cols + 1;
  const sum = new Int32Array(stride * (rows + 1));
  const occupied = new Uint8Array(cols * rows);
  for (const p of pieces) {
    for (let y = Math.max(0, p.y); y < Math.min(rows, p.y + p.h); y++) {
      for (let x = Math.max(0, p.x); x < Math.min(cols, p.x + p.w); x++) occupied[y * cols + x] = 1;
    }
  }
  // S(x, y) = occupied cells above and to the left of (x, y).
  const S = (x: number, y: number) => sum[y * stride + x] ?? 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      sum[(y + 1) * stride + x + 1] = (occupied[y * cols + x] ?? 0) + S(x + 1, y) + S(x, y + 1) - S(x, y);
    }
  }
  return (x: number, y: number, w: number, h: number) => S(x + w, y + h) - S(x + w, y) - S(x, y + h) + S(x, y) === 0;
}

/**
 * The free spot for a new piece closest to (`nearX`, `nearY`), or null when the wall is full.
 */
export function findFreeSpot(
  pieces: readonly Rect[],
  size: WallSize,
  nearX = 0,
  nearY = 0,
): { x: number; y: number } | null {
  if (size.cols < PIECE_COLS || size.rows < PIECE_ROWS) return null;
  const isFree = freeChecker(pieces, size);
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (let y = 0; y + PIECE_ROWS <= size.rows; y++) {
    for (let x = 0; x + PIECE_COLS <= size.cols; x++) {
      if (!isFree(x, y, PIECE_COLS, PIECE_ROWS)) continue;
      const distance = (x - nearX) ** 2 + (y - nearY) ** 2;
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * How big the wall is. It starts at BASE_COLS × BASE_ROWS and only grows, a strip to the
 * right and bottom at a time, when there's no room left anywhere for another piece. It is
 * always big enough to hold every existing piece.
 */
export function wallSize(pieces: readonly Rect[]): WallSize {
  let cols = BASE_COLS;
  let rows = BASE_ROWS;
  for (const p of pieces) {
    cols = Math.max(cols, p.x + p.w);
    rows = Math.max(rows, p.y + p.h);
  }
  // Each step adds at least one piece's worth of empty space, so this always ends.
  while (!hasRoom(pieces, { cols, rows })) {
    cols += GROW_COLS;
    rows += GROW_ROWS;
  }
  return { cols, rows };
}

function hasRoom(pieces: readonly Rect[], size: WallSize): boolean {
  const isFree = freeChecker(pieces, size);
  for (let y = 0; y + PIECE_ROWS <= size.rows; y++) {
    for (let x = 0; x + PIECE_COLS <= size.cols; x++) {
      if (isFree(x, y, PIECE_COLS, PIECE_ROWS)) return true;
    }
  }
  return false;
}

/** The host name to show for a piece's link, without a leading "www.". */
export function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

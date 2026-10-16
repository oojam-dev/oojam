import { describe, expect, it } from "vitest";

import {
  BASE_COLS,
  BASE_ROWS,
  canPlace,
  dataUrlBytes,
  findFreeSpot,
  GROW_COLS,
  GROW_ROWS,
  linkLabel,
  overlaps,
  PIECE_COLS,
  PIECE_ROWS,
  wallSize,
  type Rect,
} from "./graffiti";

const piece = (x: number, y: number): Rect => ({ x, y, w: PIECE_COLS, h: PIECE_ROWS });

/** Every slot of a cols × rows wall, tiled edge to edge. */
function tiled(cols: number, rows: number): Rect[] {
  const pieces: Rect[] = [];
  for (let y = 0; y + PIECE_ROWS <= rows; y += PIECE_ROWS) {
    for (let x = 0; x + PIECE_COLS <= cols; x += PIECE_COLS) pieces.push(piece(x, y));
  }
  return pieces;
}

describe("overlaps", () => {
  it("is true for rectangles that share any cell", () => {
    expect(overlaps(piece(0, 0), piece(PIECE_COLS - 1, PIECE_ROWS - 1))).toBe(true);
  });

  it("is false for rectangles that only touch edges", () => {
    expect(overlaps(piece(0, 0), piece(PIECE_COLS, 0))).toBe(false);
    expect(overlaps(piece(0, 0), piece(0, PIECE_ROWS))).toBe(false);
  });
});

describe("canPlace", () => {
  const size = { cols: BASE_COLS, rows: BASE_ROWS };

  it("accepts a free spot inside the wall", () => {
    expect(canPlace(piece(10, 10), [piece(0, 0)], size)).toBe(true);
  });

  it("rejects overlaps", () => {
    expect(canPlace(piece(3, 2), [piece(0, 0)], size)).toBe(false);
  });

  it("rejects spots off the wall or between cells", () => {
    expect(canPlace(piece(-1, 0), [], size)).toBe(false);
    expect(canPlace(piece(BASE_COLS - PIECE_COLS + 1, 0), [], size)).toBe(false);
    expect(canPlace(piece(0, BASE_ROWS - PIECE_ROWS + 1), [], size)).toBe(false);
    expect(canPlace(piece(1.5, 0), [], size)).toBe(false);
    expect(canPlace(piece(Number.NaN, 0), [], size)).toBe(false);
  });

  it("accepts the far corner exactly", () => {
    expect(canPlace(piece(BASE_COLS - PIECE_COLS, BASE_ROWS - PIECE_ROWS), [], size)).toBe(true);
  });
});

describe("findFreeSpot", () => {
  const size = { cols: BASE_COLS, rows: BASE_ROWS };

  it("returns the requested spot when it's free", () => {
    expect(findFreeSpot([], size, 12, 7)).toEqual({ x: 12, y: 7 });
  });

  it("returns the nearest free spot when the requested one is taken", () => {
    const spot = findFreeSpot([piece(0, 0)], size, 0, 0);
    expect(spot).not.toBeNull();
    expect(canPlace(piece(spot!.x, spot!.y), [piece(0, 0)], size)).toBe(true);
    expect(spot).toEqual({ x: 0, y: PIECE_ROWS });
  });

  it("returns null when the wall is full", () => {
    expect(findFreeSpot(tiled(BASE_COLS, BASE_ROWS), size)).toBeNull();
  });
});

describe("wallSize", () => {
  it("starts at the base size", () => {
    expect(wallSize([])).toEqual({ cols: BASE_COLS, rows: BASE_ROWS });
  });

  it("doesn't grow while there is room for another piece", () => {
    const almostFull = tiled(BASE_COLS, BASE_ROWS).slice(1);
    expect(wallSize(almostFull)).toEqual({ cols: BASE_COLS, rows: BASE_ROWS });
  });

  it("grows when there is no room left, and then has room", () => {
    const full = tiled(BASE_COLS, BASE_ROWS);
    const size = wallSize(full);
    expect(size).toEqual({ cols: BASE_COLS + GROW_COLS, rows: BASE_ROWS + GROW_ROWS });
    expect(findFreeSpot(full, size)).not.toBeNull();
  });

  it("always covers existing pieces", () => {
    const far = piece(200, 120);
    const size = wallSize([far]);
    expect(size.cols).toBeGreaterThanOrEqual(far.x + far.w);
    expect(size.rows).toBeGreaterThanOrEqual(far.y + far.h);
  });
});

describe("dataUrlBytes", () => {
  it("estimates the decoded size of a base64 data URL", () => {
    const base64 = Buffer.alloc(300).toString("base64");
    expect(dataUrlBytes(`data:image/png;base64,${base64}`)).toBe(300);
  });
});

describe("linkLabel", () => {
  it("shows the host without www", () => {
    expect(linkLabel("https://www.example.com/a?b=c")).toBe("example.com");
    expect(linkLabel("https://github.com/someone")).toBe("github.com");
  });
});

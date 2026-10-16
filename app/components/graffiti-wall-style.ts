import type { CSSProperties } from "react";

import { CELL_PX } from "~/lib/graffiti";

// A running-bond brick pattern whose courses line up with the wall's grid (one course per
// cell, bricks two cells long). The colours come from --wall-* in app.css, so they follow
// dark mode.
const BRICK_TILE = `<svg xmlns='http://www.w3.org/2000/svg' width='${CELL_PX * 2}' height='${CELL_PX * 2}'><path d='M0 1H${CELL_PX * 2}M0 ${CELL_PX + 1}H${CELL_PX * 2}M1 0V${CELL_PX}M${CELL_PX + 1} ${CELL_PX}V${CELL_PX * 2}' stroke='black' stroke-opacity='.13' stroke-width='2' fill='none'/></svg>`;

export const BRICK_STYLE: CSSProperties = {
  backgroundColor: "var(--wall-brick)",
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(BRICK_TILE)}")`,
  backgroundSize: `${CELL_PX * 2}px ${CELL_PX * 2}px`,
};

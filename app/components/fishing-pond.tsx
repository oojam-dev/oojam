// The fishing duel's pond (/fishing), drawn as SVG from the game state each frame. Colours come
// from --pond-* and --fishing-p2 in app.css, so the pond follows dark mode.
import { useId } from "react";

import {
  BOTTOM_Y,
  type Game,
  type KindId,
  KINDS,
  PLAYER_X,
  POND_HEIGHT,
  POND_WIDTH,
  POPUP_SECONDS,
  SURFACE_Y,
} from "~/lib/fishing";

/** Player 1 is jam; player 2 is tide. Used for fills, strokes and text. */
export const PLAYER_FILL = ["fill-jam", "fill-[var(--fishing-p2)]"] as const;
export const PLAYER_STROKE = ["stroke-jam", "stroke-[var(--fishing-p2)]"] as const;
export const PLAYER_TEXT = ["text-jam", "text-[var(--fishing-p2)]"] as const;

const ROD_HEIGHT = 34;

/** One fish (or boot, or jellyfish), centred on the origin and facing right. */
export function FishShape({ kind }: { kind: KindId }) {
  switch (kind) {
    case "minnow":
      return (
        <g>
          <path d="M-9 0 L-14 -4 L-14 4 Z" fill="#7fa3b5" />
          <ellipse rx="9" ry="4" fill="#a9c7d6" />
          <circle cx="5" cy="-1" r="1.1" fill="#1b1716" />
        </g>
      );
    case "perch":
      return (
        <g>
          <path d="M-12 0 L-19 -6 L-19 6 Z" fill="#c9761c" />
          <ellipse rx="13" ry="6" fill="#e8a33a" />
          <path d="M-5 -5.5 V5.5 M0 -6 V6 M5 -5 V5" stroke="#8a5310" strokeWidth="1.4" />
          <path d="M-4 -6 L0 -10 L5 -6 Z" fill="#c9761c" />
          <circle cx="8" cy="-1.5" r="1.4" fill="#1b1716" />
        </g>
      );
    case "bass":
      return (
        <g>
          <path d="M-18 0 L-27 -9 L-27 9 Z" fill="#3e6630" />
          <ellipse rx="20" ry="9" fill="#5b8d45" />
          <ellipse cx="2" cy="3" rx="14" ry="4.5" fill="#a9c98d" />
          <path d="M-8 -8.5 L-2 -14 L6 -8.5 Z" fill="#3e6630" />
          <path d="M18 2 L12 3" stroke="#1b1716" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="12" cy="-3" r="1.8" fill="#1b1716" />
        </g>
      );
    case "golden":
      return (
        <g>
          <path d="M-10 0 L-17 -6 L-17 6 Z" fill="#e0a500" />
          <ellipse rx="11" ry="5" fill="#ffd23f" stroke="#c48a00" strokeWidth="0.8" />
          <circle cx="6" cy="-1" r="1.2" fill="#1b1716" />
          <path d="M-2 -10 L-1 -8 L1 -7.5 L-1 -7 L-2 -5 L-3 -7 L-5 -7.5 L-3 -8 Z" fill="#fff6c2" />
        </g>
      );
    case "boot":
      return (
        <g>
          <path d="M-7 -9 H3 V3 H10 Q11 9 6 9 H-7 Z" fill="#6b4a2f" stroke="#3e2a1a" strokeWidth="1" />
          <path d="M-7 -6 H3" stroke="#3e2a1a" strokeWidth="1" />
          <path d="M-7 7 H9" stroke="#3e2a1a" strokeWidth="1.5" />
        </g>
      );
    case "jelly":
      return (
        <g>
          <path
            d="M-6 2 Q-7 8 -5 12 M-2 3 Q-3 9 -1 13 M2 3 Q3 9 1 13 M6 2 Q7 8 5 12"
            stroke="#c46fd0"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M-9 3 Q-9 -10 0 -10 Q9 -10 9 3 Z" fill="#e7a4ef" fillOpacity="0.85" stroke="#c46fd0" strokeWidth="1" />
          <circle cx="-3" cy="-4" r="1" fill="#1b1716" />
          <circle cx="3" cy="-4" r="1" fill="#1b1716" />
        </g>
      );
  }
}

function wavePath(time: number): string {
  let d = `M0 ${SURFACE_Y}`;
  for (let x = 0; x <= POND_WIDTH; x += 10) {
    d += ` L${x} ${(SURFACE_Y + Math.sin(x / 18 + time * 2) * 1.6).toFixed(2)}`;
  }
  return `${d} L${POND_WIDTH} ${SURFACE_Y + 8} L0 ${SURFACE_Y + 8} Z`;
}

const WEEDS = [24, 60, 172, 228, 342, 378];

function Boat({ index, game }: { index: 0 | 1; game: Game }) {
  const x = PLAYER_X[index];
  const player = game.players[index];
  // Player 1's boat sits left of its line, player 2's right, so both rods reach over the water.
  const mirror = index === 0 ? 1 : -1;
  const snapped = player.phase === "snapped";
  const bob = Math.sin(game.time * 2.2 + index * 1.7) * 1.2;
  return (
    <g>
      {!snapped && (
        <>
          <line
            x1={x}
            y1={SURFACE_Y - ROD_HEIGHT + bob}
            x2={x}
            y2={player.hookY}
            className="stroke-ink"
            strokeOpacity="0.55"
            strokeWidth="0.8"
          />
          <path
            d={`M${x} ${player.hookY - 4} V${player.hookY + 2} Q${x} ${player.hookY + 6} ${x - 4 * mirror} ${player.hookY + 4}`}
            className="stroke-ink"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
      <g transform={`translate(${x} ${SURFACE_Y + bob}) scale(${mirror} 1)`}>
        <line x1="-20" y1="-12" x2="0" y2={-ROD_HEIGHT} className="stroke-ink" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="-24" y1="-14" x2="-24" y2="-5" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
        <circle cx="-24" cy="-18" r="4" fill="#f1c9a5" />
        <path d="M-29 -20 H-19 L-21 -24 H-27 Z" className={PLAYER_FILL[index]} />
        <path d="M-46 -6 H-2 L-8 5 H-40 Z" className={PLAYER_FILL[index]} />
        <path d="M-46 -6 H-2" className="stroke-paper" strokeWidth="1" strokeOpacity="0.6" />
        {snapped && (
          <path d="M0 -34 Q4 -28 1 -22" className="stroke-ink" strokeOpacity="0.55" strokeWidth="0.8" fill="none" />
        )}
      </g>
    </g>
  );
}

export function FishingPond({ game, names }: { game: Game; names: readonly [string, string] }) {
  const id = useId();
  const water = `${id}-water`;
  const overlay =
    game.status === "countdown"
      ? String(Math.max(1, Math.ceil(game.clock)))
      : game.status === "over"
        ? "Time!"
        : game.status === "ready"
          ? "Gone fishing"
          : null;

  return (
    <svg
      viewBox={`0 0 ${POND_WIDTH} ${POND_HEIGHT}`}
      role="img"
      aria-label={`A pond seen from the side. ${names[0]}'s boat floats on the left, ${names[1]}'s on the right, and fish swim below.`}
      className="block h-auto w-full select-none"
    >
      <defs>
        <linearGradient id={water} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="[stop-color:var(--pond-water)]" />
          <stop offset="1" className="[stop-color:var(--pond-deep)]" />
        </linearGradient>
      </defs>
      <rect width={POND_WIDTH} height={SURFACE_Y} className="fill-[var(--pond-sky)]" />
      <circle cx={POND_WIDTH - 40} cy="22" r="11" className="fill-[var(--pond-sun)]" />
      <rect y={SURFACE_Y} width={POND_WIDTH} height={POND_HEIGHT - SURFACE_Y} fill={`url(#${water})`} />
      <path
        d={`M0 ${BOTTOM_Y + 4} Q100 ${BOTTOM_Y - 4} 200 ${BOTTOM_Y + 2} T${POND_WIDTH} ${BOTTOM_Y} V${POND_HEIGHT} H0 Z`}
        className="fill-[var(--pond-sand)]"
      />
      {WEEDS.map((x, i) => (
        <path
          key={x}
          d={`M${x} ${BOTTOM_Y + 4} q${-4 + (i % 3) * 3} -12 0 -${18 + (i % 2) * 10} q4 -8 -1 -${12 + (i % 3) * 4}`}
          fill="none"
          stroke="#3f7a4a"
          strokeOpacity="0.8"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}

      {game.fish.map((fish) => {
        // A hooked fish hangs nose-up from the hook and wriggles. Boots just dangle.
        const hanging = fish.hookedBy !== null && fish.kind !== "boot";
        const y = hanging ? game.players[fish.hookedBy ?? 0].hookY + KINDS[fish.kind].w / 2 : fish.y;
        const turn = hanging ? -90 + Math.sin(game.time * 22 + fish.id) * 12 : 0;
        return (
          <g
            key={fish.id}
            transform={`translate(${fish.x.toFixed(1)} ${y.toFixed(1)}) rotate(${turn.toFixed(1)}) scale(${hanging ? 1 : fish.dir} 1)`}
          >
            <FishShape kind={fish.kind} />
          </g>
        );
      })}

      <path d={wavePath(game.time)} className="fill-[var(--pond-water)]" fillOpacity="0.55" />
      <Boat index={0} game={game} />
      <Boat index={1} game={game} />

      {game.popups.map((popup) => (
        <text
          key={popup.id}
          x={PLAYER_X[popup.player] - 22 * (popup.player === 0 ? 1 : -1)}
          y={SURFACE_Y - 36 - popup.age * 16}
          textAnchor="middle"
          opacity={Math.max(0, 1 - popup.age / POPUP_SECONDS)}
          className={`${PLAYER_FILL[popup.player]} text-[13px] font-black`}
        >
          {popup.text}
        </text>
      ))}

      {overlay && (
        <g>
          <rect x={POND_WIDTH / 2 - 80} y="118" width="160" height="44" rx="10" className="fill-paper" fillOpacity="0.88" />
          <text x={POND_WIDTH / 2} y="148" textAnchor="middle" className="fill-ink text-[22px] font-black">
            {overlay}
          </text>
        </g>
      )}
    </svg>
  );
}

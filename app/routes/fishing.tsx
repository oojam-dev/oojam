// The fishing duel: two anglers, one pond, one device. Press to cast, press again to reel in,
// land the most points in a minute. Everything runs in the browser; nothing is stored.
import { useEffect, useRef, useState } from "react";

import type { Route } from "./+types/fishing";
import { FishingPond, FishShape, PLAYER_TEXT } from "~/components/fishing-pond";
import {
  CATCHABLE,
  createGame,
  describeEvent,
  type GameEvent,
  keyToPlayer,
  KINDS,
  leader,
  NAME_MAX,
  type Player,
  type PlayerIndex,
  playerName,
  populate,
  press,
  ROUND_SECONDS,
  startRound,
  step,
} from "~/lib/fishing";

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Fishing duel · oojam" },
    {
      name: "description",
      content: "A two-player fishing game for one device. Cast, reel, dodge the jellyfish, out-fish your friend.",
    },
  ];
}

const PLAYERS: readonly PlayerIndex[] = [0, 1];
const KEYS = ["A", "L"] as const;

function buttonLabel(player: Player, playing: boolean, caught: string | null): string {
  if (!playing) return "Wait for it…";
  switch (player.phase) {
    case "idle":
      return "Cast";
    case "sinking":
      return "Reel in";
    case "reeling":
      return caught ? `Landing ${caught}…` : "Reeling…";
    case "snapped":
      return "Line snapped!";
  }
}

export default function Fishing() {
  const [game] = useState(createGame);
  const [, setFrame] = useState(0);
  const [rawNames, setRawNames] = useState<[string, string]>(["", ""]);
  const [announcement, setAnnouncement] = useState("");
  const [record, setRecord] = useState({ wins: [0, 0], ties: 0 });

  const names = [playerName(rawNames[0], 0), playerName(rawNames[1], 1)] as const;
  // The animation loop outlives renders, so it reads the latest names through a ref.
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    populate(game, Math.random);
    let raf = 0;
    let last = performance.now();
    const onEvents = (events: GameEvent[]) => {
      for (const event of events) {
        const line = describeEvent(event, namesRef.current);
        if (line) setAnnouncement(line);
        if (event.type === "end") {
          const winner = leader(event.scores);
          setRecord((r) =>
            winner === null
              ? { ...r, ties: r.ties + 1 }
              : { ...r, wins: r.wins.map((w, i) => (i === winner ? w + 1 : w)) },
          );
        }
      }
    };
    const tick = (now: number) => {
      const events = step(game, (now - last) / 1000, Math.random);
      last = now;
      if (events.length > 0) onEvents(events);
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      const index = keyToPlayer(e.key);
      if (index !== null && press(game, index)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  const start = () => {
    startRound(game, Math.random);
    setAnnouncement("Get ready…");
  };

  const playing = game.status === "playing";
  const busy = game.status === "countdown" || playing;
  const seconds = game.status === "countdown" ? ROUND_SECONDS : Math.ceil(game.clock);
  const scores = [game.players[0].score, game.players[1].score] as const;
  const winner = leader(scores);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-12 pb-16 sm:px-6 sm:pt-16">
      <p className="font-mono text-xs tracking-widest text-muted uppercase">
        <a href="/">oojam</a> · fishing duel
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Fishing duel</h1>
      <p className="mt-3 max-w-xl text-lg text-pretty">
        Two anglers, one pond, one minute. Press once to cast, again to reel in. Whatever your hook touches first
        bites. Mind the jellyfish: they snap your line.
      </p>

      <fieldset className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2" disabled={busy}>
        <legend className="sr-only">Player names</legend>
        {PLAYERS.map((i) => (
          <label key={i} className="block">
            <span className={`text-sm font-semibold ${PLAYER_TEXT[i]}`}>
              Player {i + 1} name <span className="font-normal text-muted">(optional)</span>
            </span>
            <input
              type="text"
              value={rawNames[i]}
              maxLength={NAME_MAX}
              autoComplete="off"
              placeholder={`Player ${i + 1}`}
              onChange={(e) => {
                const value = e.target.value;
                setRawNames((n) => (i === 0 ? [value, n[1]] : [n[0], value]));
              }}
              className="mt-1 block w-full rounded-md border border-line bg-panel px-3 py-2 text-ink placeholder:text-muted disabled:opacity-60"
            />
          </label>
        ))}
      </fieldset>

      <section aria-label="Scoreboard" className="mt-6 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <Score index={0} name={names[0]} score={scores[0]} />
        <p className="text-center">
          <span className="block font-mono text-xs tracking-widest text-muted uppercase">Time</span>
          <span className="font-mono text-3xl font-bold tabular-nums">{seconds}</span>
        </p>
        <Score index={1} name={names[1]} score={scores[1]} />
      </section>

      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <FishingPond game={game} names={names} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {PLAYERS.map((i) => {
          const player = game.players[i];
          const hooked = game.fish.find((f) => f.id === player.fishId);
          const label = buttonLabel(player, playing, hooked ? KINDS[hooked.kind].label : null);
          return (
            <button
              key={i}
              type="button"
              aria-disabled={!playing || player.phase === "reeling" || player.phase === "snapped"}
              onClick={() => press(game, i)}
              className={`min-h-24 touch-manipulation rounded-xl border-2 bg-panel px-3 py-4 text-center select-none ${
                i === 0 ? "border-jam" : "border-[var(--fishing-p2)]"
              } ${playing && (player.phase === "idle" || player.phase === "sinking") ? "" : "border-dashed"}`}
            >
              <span className={`block truncate text-sm font-semibold ${PLAYER_TEXT[i]}`}>{names[i]}</span>
              <span className="mt-1 block text-lg leading-tight font-bold text-ink">{label}</span>
              <span className="mt-1 block text-xs text-muted">
                or press <kbd className="rounded border border-line px-1 font-mono">{KEYS[i]}</kbd>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="rounded-full bg-jam px-6 py-3 font-semibold text-paper disabled:opacity-50"
        >
          {game.status === "over" ? "Play again" : busy ? "Round in progress" : "Start the round"}
        </button>
        {(record.wins[0] ?? 0) + (record.wins[1] ?? 0) + record.ties > 0 && (
          <p className="text-sm text-muted">
            Rounds won: {names[0]} {record.wins[0]}, {names[1]} {record.wins[1]}
            {record.ties > 0 && `, ties ${record.ties}`}
          </p>
        )}
      </div>

      <p role="status" aria-live="polite" className="mt-4 min-h-6 font-medium">
        {announcement}
      </p>

      {game.status === "over" && (
        <section aria-labelledby="results" className="mt-6 rounded-xl border border-line bg-panel p-5">
          <h2 id="results" className="text-2xl font-black tracking-tight">
            {winner === null ? "It's a tie!" : <span className={PLAYER_TEXT[winner]}>{names[winner]} wins!</span>}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PLAYERS.map((i) => (
              <div key={i}>
                <h3 className={`font-semibold ${PLAYER_TEXT[i]}`}>
                  {names[i]}: {scores[i]} {scores[i] === 1 ? "point" : "points"}
                </h3>
                <ul className="mt-1 text-sm text-muted">
                  {CATCHABLE.filter((k) => game.players[i].catches[k] > 0).map((k) => (
                    <li key={k}>
                      {game.players[i].catches[k]} × {KINDS[k].label.replace(/^(a|an|the) /, "")}
                    </li>
                  ))}
                  {CATCHABLE.every((k) => game.players[i].catches[k] === 0) && <li>An empty bucket.</li>}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="whats-biting" className="mt-12">
        <h2 id="whats-biting" className="font-mono text-xs tracking-widest text-muted uppercase">
          What's biting
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[...CATCHABLE, "jelly" as const].map((kind) => (
            <li key={kind} className="flex items-center gap-3">
              <svg viewBox="-28 -16 56 32" aria-hidden="true" className="h-8 w-14 shrink-0">
                <FishShape kind={kind} />
              </svg>
              <span>
                <span className="font-semibold capitalize">{KINDS[kind].label.replace(/^(a|an|the) /, "")}</span>
                <span className="text-muted"> · {LEGEND[kind]}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">
          Sharing a keyboard? Player 1 presses <kbd className="font-mono">A</kbd>, player 2 presses{" "}
          <kbd className="font-mono">L</kbd>. On a phone or tablet, each player taps their own button.
        </p>
      </section>
    </main>
  );
}

const LEGEND = {
  minnow: "1 point. Quick and shallow.",
  perch: "3 points. Swims in the middle.",
  bass: "5 points. Deep, and heavy to reel.",
  golden: "10 points. Rare and very fast.",
  boot: "0 points. Lurks on the bottom.",
  jelly: "Snaps your line and frees your fish.",
} as const;

function Score({ index, name, score }: { index: PlayerIndex; name: string; score: number }) {
  return (
    <p className={index === 0 ? "text-left" : "text-right"}>
      <span className={`block truncate text-sm font-semibold ${PLAYER_TEXT[index]}`}>{name}</span>
      <span className="font-mono text-3xl font-bold tabular-nums">{score}</span>
    </p>
  );
}

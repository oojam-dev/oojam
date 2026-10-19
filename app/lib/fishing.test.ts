import { describe, expect, it } from "vitest";

import {
  BOTTOM_Y,
  COUNTDOWN_SECONDS,
  createGame,
  describeEvent,
  type Game,
  type GameEvent,
  keyToPlayer,
  KINDS,
  leader,
  PLAYER_X,
  playerName,
  populate,
  press,
  ROUND_SECONDS,
  SNAP_SECONDS,
  spawnFish,
  startRound,
  step,
  SURFACE_Y,
  touches,
} from "./fishing";

/** A seeded generator, so spawns are repeatable. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** A game that's already playing, with an empty pond and spawning held off. */
function playing(): Game {
  const game = createGame();
  game.status = "playing";
  game.spawnTimer = Infinity;
  return game;
}

/** Puts a still fish of `kind` at (x, y). */
function place(game: Game, kind: keyof typeof KINDS, x: number, y: number) {
  const fish = spawnFish(game, () => 0.5, x, kind);
  fish.y = fish.baseY = y;
  fish.speed = 0;
  return fish;
}

function run(game: Game, seconds: number, rng = seeded()): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...step(game, 1 / 60, rng));
  return events;
}

/** Steps a frame at a time until an event of `type` happens (or ten seconds pass). */
function runUntil(game: Game, type: GameEvent["type"], rng = seeded()): GameEvent | undefined {
  for (let t = 0; t < 10; t += 1 / 60) {
    const event = step(game, 1 / 60, rng).find((e) => e.type === type);
    if (event) return event;
  }
  return undefined;
}

describe("fishing duel", () => {
  it("starts as a deterministic, empty pond", () => {
    expect(createGame()).toEqual(createGame());
    expect(createGame().fish).toHaveLength(0);
  });

  it("populates idempotently and keeps fish inside their depth bands", () => {
    const game = createGame();
    const rng = seeded(7);
    populate(game, rng);
    const count = game.fish.length;
    populate(game, rng);
    expect(game.fish.length).toBe(count);
    for (const fish of game.fish) {
      const spec = KINDS[fish.kind];
      expect(fish.baseY).toBeGreaterThanOrEqual(SURFACE_Y + spec.minDepth * (BOTTOM_Y - SURFACE_Y));
      expect(fish.baseY).toBeLessThanOrEqual(SURFACE_Y + spec.maxDepth * (BOTTOM_Y - SURFACE_Y));
    }
  });

  it("never spawns more than two jellyfish", () => {
    const game = createGame();
    for (let i = 0; i < 50; i++) spawnFish(game, () => 0.99);
    expect(game.fish.filter((f) => f.kind === "jelly").length).toBeLessThanOrEqual(2);
  });

  it("counts down, plays a full round, then ends with the scores", () => {
    const game = createGame();
    startRound(game, seeded());
    expect(game.status).toBe("countdown");
    expect(press(game, 0)).toBe(false);
    const started = run(game, COUNTDOWN_SECONDS + 0.05);
    expect(started).toContainEqual({ type: "start" });
    expect(game.status).toBe("playing");
    const ended = run(game, ROUND_SECONDS + 0.05);
    expect(ended.at(-1)).toEqual({ type: "end", scores: [0, 0] });
    expect(game.status).toBe("over");
    expect(press(game, 1)).toBe(false);
  });

  it("casts on the first press and reels in on the second", () => {
    const game = playing();
    expect(press(game, 0)).toBe(true);
    expect(game.players[0].phase).toBe("sinking");
    run(game, 0.5);
    expect(game.players[0].hookY).toBeGreaterThan(SURFACE_Y);
    expect(press(game, 0)).toBe(true);
    expect(game.players[0].phase).toBe("reeling");
    expect(press(game, 0)).toBe(false);
    run(game, 2);
    expect(game.players[0].phase).toBe("idle");
    expect(game.players[0].hookY).toBe(SURFACE_Y);
    expect(game.players[1].phase).toBe("idle");
  });

  it("reels back up by itself when the hook hits the bottom", () => {
    const game = playing();
    press(game, 1);
    run(game, (BOTTOM_Y - SURFACE_Y) / 85 + 0.1);
    expect(game.players[1].phase).toBe("reeling");
  });

  it("hooks the first fish it touches and scores it on landing", () => {
    const game = playing();
    const perch = place(game, "perch", PLAYER_X[0], 140);
    press(game, 0);
    const hooked = run(game, 1.2);
    expect(hooked).toContainEqual({ type: "hook", player: 0, kind: "perch" });
    expect(perch.hookedBy).toBe(0);
    expect(runUntil(game, "catch")).toEqual({ type: "catch", player: 0, kind: "perch", points: 3 });
    expect(game.players[0].score).toBe(3);
    expect(game.players[0].catches.perch).toBe(1);
    expect(game.fish).not.toContain(perch);
    expect(game.popups.map((p) => p.text)).toContain("+3");
  });

  it("reels a heavy fish more slowly than an empty hook", () => {
    const empty = playing();
    empty.players[0] = { ...empty.players[0], phase: "reeling", hookY: 200 };
    run(empty, 0.5);
    const loaded = playing();
    const bass = place(loaded, "bass", PLAYER_X[0], 200);
    loaded.players[0] = { ...loaded.players[0], phase: "reeling", hookY: 200, fishId: bass.id };
    bass.hookedBy = 0;
    run(loaded, 0.5);
    expect(loaded.players[0].hookY).toBeGreaterThan(empty.players[0].hookY);
  });

  it("snaps the line on a jellyfish and lets the catch go", () => {
    const game = playing();
    const bass = place(game, "bass", PLAYER_X[1], 220);
    press(game, 1);
    expect(runUntil(game, "hook")).toEqual({ type: "hook", player: 1, kind: "bass" });
    place(game, "jelly", PLAYER_X[1], 120);
    expect(runUntil(game, "snap")).toEqual({ type: "snap", player: 1, lost: "bass" });
    expect(game.players[1].phase).toBe("snapped");
    expect(bass.hookedBy).toBeNull();
    expect(press(game, 1)).toBe(false);
    run(game, SNAP_SECONDS + 0.1);
    expect(game.players[1].phase).toBe("idle");
    expect(game.players[1].score).toBe(0);
  });

  it("lets go of hooked fish when time runs out", () => {
    const game = playing();
    const minnow = place(game, "minnow", PLAYER_X[0], 180);
    press(game, 0);
    runUntil(game, "hook");
    expect(minnow.hookedBy).toBe(0);
    game.clock = 0.01;
    run(game, 0.1);
    expect(game.status).toBe("over");
    expect(minnow.hookedBy).toBeNull();
    expect(game.players[0].fishId).toBeNull();
    expect(game.players[0].score).toBe(0);
  });

  it("uses a hit box around each fish", () => {
    const game = createGame();
    const fish = place(game, "bass", 100, 150);
    expect(touches(fish, 100, 150)).toBe(true);
    expect(touches(fish, 100 + KINDS.bass.w / 2 + 2, 150)).toBe(true);
    expect(touches(fish, 100 + KINDS.bass.w, 150)).toBe(false);
    expect(touches(fish, 100, 150 + KINDS.bass.h)).toBe(false);
  });

  it("removes fish that swim off the edge and spawns new ones", () => {
    const game = createGame();
    const fish = place(game, "golden", 380, 150);
    fish.dir = 1;
    fish.speed = 200;
    run(game, 1);
    expect(game.fish).not.toContain(fish);
    expect(game.fish.length).toBeGreaterThan(0);
  });

  it("maps keys, names and leaders", () => {
    expect(keyToPlayer("a")).toBe(0);
    expect(keyToPlayer("L")).toBe(1);
    expect(keyToPlayer(" ")).toBeNull();
    expect(playerName("  Captain   Ahab ", 0)).toBe("Captain Ahab");
    expect(playerName("   ", 1)).toBe("Player 2");
    expect(playerName("x".repeat(40), 0)).toHaveLength(16);
    expect(leader([3, 1])).toBe(0);
    expect(leader([3, 9])).toBe(1);
    expect(leader([4, 4])).toBeNull();
  });

  it("describes events for screen readers", () => {
    const names = ["Ann", "Bo"] as const;
    expect(describeEvent({ type: "catch", player: 1, kind: "golden", points: 10 }, names)).toBe(
      "Bo landed the golden carp! Plus 10.",
    );
    expect(describeEvent({ type: "catch", player: 0, kind: "boot", points: 0 }, names)).toMatch(/old boot/);
    expect(describeEvent({ type: "snap", player: 0, lost: "perch" }, names)).toMatch(/a perch got away/);
    expect(describeEvent({ type: "hook", player: 0, kind: "perch" }, names)).toBeNull();
    expect(describeEvent({ type: "end", scores: [4, 9] }, names)).toBe("Time! Bo wins, 9 to 4.");
    expect(describeEvent({ type: "end", scores: [2, 2] }, names)).toBe("Time! It's a tie, 2 all.");
  });
});

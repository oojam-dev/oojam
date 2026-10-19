// The fishing duel (/fishing): two anglers share one pond and one device. Each has a single
// button: press to cast, press again to reel in. Whatever the hook touches first bites; land
// it to score, but brush a jellyfish and the line snaps. This module is the pond and its rules,
// with no React or DOM, so the page can run it in an animation loop and the tests can drive it
// frame by frame. `step` and `press` mutate the game in place, which keeps 60 fps cheap.

/** The pond's coordinate space, in SVG user units. */
export const POND_WIDTH = 400;
export const POND_HEIGHT = 260;
export const SURFACE_Y = 64;
export const BOTTOM_Y = 244;

export const ROUND_SECONDS = 60;
export const COUNTDOWN_SECONDS = 3;
/** How long a snapped line takes to re-tie. */
export const SNAP_SECONDS = 1.5;
/** Hook speeds, in units per second. Reeling slows by the hooked fish's `drag`. */
export const SINK_SPEED = 85;
export const REEL_SPEED = 150;
/** Where each angler's line drops. Player 1 fishes the left of the pond, player 2 the right. */
export const PLAYER_X = [110, 290] as const;
/** How long a "+5" floats above a boat. */
export const POPUP_SECONDS = 1.2;

const TARGET_FISH = 9;
const MAX_JELLIES = 2;
const HOOK_REACH = 3;
/** Never dt more than this per frame, so a backgrounded tab doesn't teleport the fish. */
const MAX_STEP = 0.1;

export type Rng = () => number;
export type PlayerIndex = 0 | 1;
export type KindId = "minnow" | "perch" | "bass" | "golden" | "boot" | "jelly";

type KindSpec = {
  /** With its article, as it reads in a sentence: "landed a perch". */
  label: string;
  points: number;
  /** Swimming speed, units per second. */
  speed: number;
  w: number;
  h: number;
  /** Depth band as a fraction of the water, 0 at the surface and 1 at the bottom. */
  minDepth: number;
  maxDepth: number;
  /** Reel speed multiplier while this is on the hook. */
  drag: number;
  /** Relative chance of spawning. */
  weight: number;
  /** Vertical bob, in units. */
  bob: number;
};

export const KINDS: Record<KindId, KindSpec> = {
  minnow: { label: "a minnow", points: 1, speed: 55, w: 18, h: 8, minDepth: 0.12, maxDepth: 0.45, drag: 0.85, weight: 36, bob: 3 },
  perch: { label: "a perch", points: 3, speed: 40, w: 26, h: 12, minDepth: 0.35, maxDepth: 0.7, drag: 0.6, weight: 28, bob: 3 },
  bass: { label: "a big bass", points: 5, speed: 26, w: 40, h: 18, minDepth: 0.62, maxDepth: 0.9, drag: 0.42, weight: 14, bob: 2 },
  golden: { label: "the golden carp", points: 10, speed: 95, w: 22, h: 10, minDepth: 0.3, maxDepth: 0.88, drag: 0.7, weight: 4, bob: 4 },
  boot: { label: "an old boot", points: 0, speed: 10, w: 20, h: 18, minDepth: 0.9, maxDepth: 0.95, drag: 0.5, weight: 7, bob: 0 },
  jelly: { label: "a jellyfish", points: 0, speed: 14, w: 18, h: 20, minDepth: 0.2, maxDepth: 0.8, drag: 1, weight: 9, bob: 9 },
};

/** Everything that can end up in your bucket, in the order the legend and results list them. */
export const CATCHABLE: readonly Exclude<KindId, "jelly">[] = ["minnow", "perch", "bass", "golden", "boot"];

export type Fish = {
  id: number;
  kind: KindId;
  x: number;
  y: number;
  /** The depth it swims at; `y` bobs around it. */
  baseY: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  hookedBy: PlayerIndex | null;
};

export type Player = {
  phase: "idle" | "sinking" | "reeling" | "snapped";
  hookY: number;
  fishId: number | null;
  snapTimer: number;
  score: number;
  catches: Record<KindId, number>;
};

export type Popup = { id: number; player: PlayerIndex; text: string; age: number };

export type Game = {
  status: "ready" | "countdown" | "playing" | "over";
  /** Seconds left in the countdown or the round. */
  clock: number;
  /** Seconds since the pond was created; drives the bobbing and the waves. */
  time: number;
  frame: number;
  fish: Fish[];
  players: [Player, Player];
  popups: Popup[];
  nextId: number;
  spawnTimer: number;
};

export type GameEvent =
  | { type: "start" }
  | { type: "hook"; player: PlayerIndex; kind: KindId }
  | { type: "catch"; player: PlayerIndex; kind: KindId; points: number }
  | { type: "snap"; player: PlayerIndex; lost: KindId | null }
  | { type: "end"; scores: [number, number] };

function emptyCatches(): Record<KindId, number> {
  return { minnow: 0, perch: 0, bass: 0, golden: 0, boot: 0, jelly: 0 };
}

function newPlayer(): Player {
  return { phase: "idle", hookY: SURFACE_Y, fishId: null, snapTimer: 0, score: 0, catches: emptyCatches() };
}

/** A still, empty pond. Deterministic, so the server and the browser render the same thing. */
export function createGame(): Game {
  return {
    status: "ready",
    clock: ROUND_SECONDS,
    time: 0,
    frame: 0,
    fish: [],
    players: [newPlayer(), newPlayer()],
    popups: [],
    nextId: 1,
    spawnTimer: 0,
  };
}

function pickKind(game: Game, rng: Rng): KindId {
  const jellies = game.fish.filter((f) => f.kind === "jelly").length;
  const kinds = (Object.keys(KINDS) as KindId[]).filter((k) => k !== "jelly" || jellies < MAX_JELLIES);
  const total = kinds.reduce((sum, k) => sum + KINDS[k].weight, 0);
  let roll = rng() * total;
  for (const kind of kinds) {
    roll -= KINDS[kind].weight;
    if (roll < 0) return kind;
  }
  return kinds[kinds.length - 1] ?? "minnow";
}

/** Adds one fish. Without `x` it swims in from whichever edge it's facing away from. */
export function spawnFish(game: Game, rng: Rng, x?: number, kind: KindId = pickKind(game, rng)): Fish {
  const spec = KINDS[kind];
  const dir = rng() < 0.5 ? 1 : -1;
  const depth = spec.minDepth + rng() * (spec.maxDepth - spec.minDepth);
  const baseY = SURFACE_Y + depth * (BOTTOM_Y - SURFACE_Y);
  const fish: Fish = {
    id: game.nextId++,
    kind,
    x: x ?? (dir === 1 ? -spec.w : POND_WIDTH + spec.w),
    y: baseY,
    baseY,
    dir,
    speed: spec.speed * (0.8 + rng() * 0.4),
    phase: rng() * Math.PI * 2,
    hookedBy: null,
  };
  game.fish.push(fish);
  return fish;
}

/** Tops the pond up with fish scattered across it. Safe to call more than once. */
export function populate(game: Game, rng: Rng): void {
  while (game.fish.length < TARGET_FISH) spawnFish(game, rng, 20 + rng() * (POND_WIDTH - 40));
}

/** Clears the scores and starts the countdown to a fresh round. */
export function startRound(game: Game, rng: Rng): void {
  for (const fish of game.fish) fish.hookedBy = null;
  game.players = [newPlayer(), newPlayer()];
  game.popups = [];
  game.status = "countdown";
  game.clock = COUNTDOWN_SECONDS;
  populate(game, rng);
}

/** One player's button: cast if the hook is up, reel in if it's sinking. Returns whether it did anything. */
export function press(game: Game, index: PlayerIndex): boolean {
  if (game.status !== "playing") return false;
  const player = game.players[index];
  if (player.phase === "idle") {
    player.phase = "sinking";
    player.hookY = SURFACE_Y;
    return true;
  }
  if (player.phase === "sinking") {
    player.phase = "reeling";
    return true;
  }
  return false;
}

/** Whether a hook at (x, y) touches this fish. */
export function touches(fish: Fish, x: number, y: number): boolean {
  const spec = KINDS[fish.kind];
  return Math.abs(fish.x - x) <= spec.w / 2 + HOOK_REACH && Math.abs(fish.y - y) <= spec.h / 2 + HOOK_REACH;
}

function addPopup(game: Game, player: PlayerIndex, text: string): void {
  game.popups.push({ id: game.nextId++, player, text, age: 0 });
}

function release(game: Game, player: Player): KindId | null {
  const fish = game.fish.find((f) => f.id === player.fishId);
  player.fishId = null;
  if (!fish) return null;
  fish.hookedBy = null;
  fish.baseY = fish.y;
  return fish.kind;
}

function moveFish(game: Game, dt: number): void {
  for (const fish of game.fish) {
    const spec = KINDS[fish.kind];
    if (fish.hookedBy !== null) {
      fish.x = PLAYER_X[fish.hookedBy];
      fish.y = game.players[fish.hookedBy].hookY + spec.h / 2;
      continue;
    }
    fish.x += fish.dir * fish.speed * dt;
    const rate = fish.kind === "jelly" ? 1.2 : 3;
    fish.y = fish.baseY + Math.sin(game.time * rate + fish.phase) * spec.bob;
  }
  game.fish = game.fish.filter(
    (f) => f.hookedBy !== null || (f.x > -KINDS[f.kind].w * 2 && f.x < POND_WIDTH + KINDS[f.kind].w * 2),
  );
}

function movePlayer(game: Game, index: PlayerIndex, dt: number, events: GameEvent[]): void {
  const player = game.players[index];
  if (player.phase === "idle") return;
  if (player.phase === "snapped") {
    player.snapTimer -= dt;
    if (player.snapTimer <= 0) player.phase = "idle";
    return;
  }

  const hooked = game.fish.find((f) => f.id === player.fishId) ?? null;
  if (player.phase === "sinking") {
    player.hookY = Math.min(BOTTOM_Y, player.hookY + SINK_SPEED * dt);
    if (player.hookY >= BOTTOM_Y) player.phase = "reeling";
  } else {
    player.hookY -= REEL_SPEED * (hooked ? KINDS[hooked.kind].drag : 1) * dt;
    if (player.hookY <= SURFACE_Y) {
      player.hookY = SURFACE_Y;
      player.phase = "idle";
      if (hooked) {
        const points = KINDS[hooked.kind].points;
        player.score += points;
        player.catches[hooked.kind] += 1;
        player.fishId = null;
        hooked.hookedBy = null;
        game.fish = game.fish.filter((f) => f !== hooked);
        addPopup(game, index, hooked.kind === "boot" ? "boot!" : `+${points}`);
        events.push({ type: "catch", player: index, kind: hooked.kind, points });
      }
      return;
    }
  }

  const x = PLAYER_X[index];
  const free = game.fish.filter((f) => f.hookedBy === null && touches(f, x, player.hookY));
  if (free.some((f) => f.kind === "jelly")) {
    const lost = release(game, player);
    player.phase = "snapped";
    player.snapTimer = SNAP_SECONDS;
    player.hookY = SURFACE_Y;
    addPopup(game, index, "snap!");
    events.push({ type: "snap", player: index, lost });
    return;
  }
  if (!hooked) {
    const bite = free[0];
    if (bite) {
      bite.hookedBy = index;
      player.fishId = bite.id;
      player.phase = "reeling";
      events.push({ type: "hook", player: index, kind: bite.kind });
    }
  }
}

/** Advances the pond by `dt` seconds and returns what happened. */
export function step(game: Game, dt: number, rng: Rng): GameEvent[] {
  dt = Math.max(0, Math.min(dt, MAX_STEP));
  const events: GameEvent[] = [];
  game.time += dt;
  game.frame += 1;

  if (game.status === "countdown") {
    game.clock -= dt;
    if (game.clock <= 0) {
      game.status = "playing";
      game.clock = ROUND_SECONDS;
      events.push({ type: "start" });
    }
  } else if (game.status === "playing") {
    game.clock = Math.max(0, game.clock - dt);
  }

  moveFish(game, dt);

  if (game.status === "playing") {
    // Alternate who goes first, so neither player always wins a fish both hooks touch.
    const order: PlayerIndex[] = game.frame % 2 === 0 ? [0, 1] : [1, 0];
    for (const index of order) movePlayer(game, index, dt, events);
    if (game.clock <= 0) {
      game.status = "over";
      for (const player of game.players) {
        release(game, player);
        player.phase = "idle";
        player.hookY = SURFACE_Y;
      }
      events.push({ type: "end", scores: [game.players[0].score, game.players[1].score] });
    }
  }

  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0 && game.fish.length < TARGET_FISH) {
    spawnFish(game, rng);
    game.spawnTimer = 0.5 + rng() * 0.9;
  }

  for (const popup of game.popups) popup.age += dt;
  game.popups = game.popups.filter((p) => p.age < POPUP_SECONDS);
  return events;
}

/** The leader, or null for a tie. */
export function leader(scores: readonly [number, number]): PlayerIndex | null {
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

/** The keyboard: A for player 1, L for player 2. */
export function keyToPlayer(key: string): PlayerIndex | null {
  const k = key.toLowerCase();
  if (k === "a") return 0;
  if (k === "l") return 1;
  return null;
}

export const NAME_MAX = 16;

/** What a player typed into their name box, tidied, or "Player N" if they left it blank. */
export function playerName(input: string, index: PlayerIndex): string {
  const name = input.replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
  return name || `Player ${index + 1}`;
}

/** A sentence for screen readers. `hook` events are left silent; they'd be too chatty. */
export function describeEvent(event: GameEvent, names: readonly [string, string]): string | null {
  switch (event.type) {
    case "start":
      return `Go! ${ROUND_SECONDS} seconds on the clock.`;
    case "hook":
      return null;
    case "catch": {
      const who = names[event.player];
      if (event.kind === "boot") return `${who} reeled in an old boot. No points.`;
      return `${who} landed ${KINDS[event.kind].label}! Plus ${event.points}.`;
    }
    case "snap": {
      const who = names[event.player];
      return event.lost
        ? `${who} hit a jellyfish. The line snapped and ${KINDS[event.lost].label} got away.`
        : `${who} hit a jellyfish. The line snapped.`;
    }
    case "end": {
      const [a, b] = event.scores;
      const winner = leader(event.scores);
      if (winner === null) return `Time! It's a tie, ${a} all.`;
      return `Time! ${names[winner]} wins, ${Math.max(a, b)} to ${Math.min(a, b)}.`;
    }
  }
}

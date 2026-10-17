// The shrine of Captain Holder (/shrine): the offerings pilgrims can leave, the three Hail Marys
// they must say first, and the blessings they get back. Shared by the page and its action.

/** Hail Marys a pilgrim must say before their respects count. Not two. Not four. Three. */
export const HAIL_MARYS = 3;

/** Candles on the shrine's shelf. Each respect paid keeps one lit for a day. */
export const CANDLE_COUNT = 7;

/** Everything a pilgrim may leave on the altar. Ids are stored in the database; never rename them. */
export const OFFERINGS = [
  { id: "tea", emoji: "🫖", name: "A cup of tea", note: "You will have some. Go on, go on, go on." },
  { id: "cow", emoji: "🐄", name: "A small cow", note: "Or possibly a far away one. Hard to say." },
  { id: "placard", emoji: "🪧", name: "A “Careful now” placard", note: "Down with this sort of thing." },
  { id: "horse", emoji: "🐴", name: "A lovely horse", note: "Mane like a flowing mane. Second place at best." },
  { id: "sandwiches", emoji: "🥪", name: "A plate of sandwiches", note: "Mrs Doyle made far too many. Again." },
  { id: "candle", emoji: "🕯️", name: "A votive candle", note: "Small, but the Captain's blessings are far away." },
] as const;

export type Offering = (typeof OFFERINGS)[number];
export type OfferingId = Offering["id"];

export function findOffering(id: unknown): Offering | undefined {
  return OFFERINGS.find((offering) => offering.id === id);
}

/** What the Captain says back once your respects are paid. */
export const BLESSINGS = [
  "Careful now.",
  "Down with this sort of thing. (Not you. You're grand.)",
  "Ah, go on. The Captain is very pleased.",
  "That would be an ecumenical matter, and the Captain approves of it.",
  "Remember: your sins are small. The Captain's patience is far away.",
  "The collection plate thanks you. The money is just resting there.",
  "Your soul is now four per cent more Craggy.",
  "A tea has been poured for you. You will have it. There is no choice in this matter.",
  "The Captain nods slowly, as if to say: “That's grand, that's grand.”",
  "Somewhere, a lovely horse whinnies in your honour.",
] as const;

/** A blessing chosen by the respect's id, so it's the same on the server and in the browser. */
export function blessingFor(id: number): string {
  const index = Number.isSafeInteger(id) ? Math.abs(id) % BLESSINGS.length : 0;
  return BLESSINGS[index]!;
}

/** Candles alight for this many respects in the last day. The first one never goes out. */
export function litCandles(recentRespects: number, max = CANDLE_COUNT): number {
  if (!Number.isFinite(recentRespects)) return 1;
  return Math.min(max, Math.max(1, Math.floor(recentRespects) + 1));
}

/** Per-offering counts in OFFERINGS order, ignoring ids that aren't offerings any more. */
export function tallyOfferings(rows: readonly { offering: string; n: number }[]): { offering: Offering; n: number }[] {
  return OFFERINGS.map((offering) => ({
    offering,
    n: rows.filter((row) => row.offering === offering.id).reduce((sum, row) => sum + row.n, 0),
  }));
}

/** Distinct Hail Marys ticked on the form (each checkbox sends its number, 1 to HAIL_MARYS). */
export function countHailMarys(values: readonly unknown[]): number {
  const said = new Set<number>();
  for (const value of values) {
    const n = Number(value);
    if (typeof value === "string" && Number.isInteger(n) && n >= 1 && n <= HAIL_MARYS) said.add(n);
  }
  return said.size;
}

export type RespectsResult = { ok: true; offering: OfferingId } | { ok: false; error: string };

/** Checks a pilgrim's form: all three Hail Marys said, and a real offering chosen. */
export function parseRespects(form: FormData): RespectsResult {
  const said = countHailMarys(form.getAll("hailMary"));
  if (said < HAIL_MARYS) {
    const missing = HAIL_MARYS - said;
    return {
      ok: false,
      error: `The Captain requires three Hail Marys. You've ${missing} more to say.`,
    };
  }
  const offering = findOffering(form.get("offering"));
  if (!offering) return { ok: false, error: "Choose an offering to leave on the altar." };
  return { ok: true, offering: offering.id };
}

/** "1 pilgrim", "2 pilgrims". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "17 Oct, 09:05 UTC". Built by hand so the server and every browser render it identically. */
export function formatRegisterTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

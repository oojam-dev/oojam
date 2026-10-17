import { describe, expect, it } from "vitest";

import {
  BLESSINGS,
  CANDLE_COUNT,
  blessingFor,
  countHailMarys,
  findOffering,
  formatRegisterTime,
  litCandles,
  OFFERINGS,
  parseRespects,
  plural,
  tallyOfferings,
} from "./shrine";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("shrine", () => {
  it("has unique offering ids", () => {
    expect(new Set(OFFERINGS.map((o) => o.id)).size).toBe(OFFERINGS.length);
    expect(findOffering("tea")?.name).toBe("A cup of tea");
    expect(findOffering("toString")).toBeUndefined();
    expect(findOffering(null)).toBeUndefined();
  });

  it("counts each Hail Mary once, and only real ones", () => {
    expect(countHailMarys(["1", "2", "3"])).toBe(3);
    expect(countHailMarys(["1", "1", "1"])).toBe(1);
    expect(countHailMarys(["0", "4", "1.5", "two", ""])).toBe(0);
    expect(countHailMarys([])).toBe(0);
  });

  it("accepts three Hail Marys and an offering", () => {
    const result = parseRespects(
      form([
        ["hailMary", "1"],
        ["hailMary", "2"],
        ["hailMary", "3"],
        ["offering", "cow"],
      ]),
    );
    expect(result).toEqual({ ok: true, offering: "cow" });
  });

  it("insists on three Hail Marys", () => {
    const result = parseRespects(
      form([
        ["hailMary", "1"],
        ["hailMary", "1"],
        ["hailMary", "2"],
        ["offering", "tea"],
      ]),
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining("1 more") });
    expect(parseRespects(form([["offering", "tea"]])).ok).toBe(false);
  });

  it("rejects missing or made-up offerings", () => {
    const prayers: [string, string][] = [
      ["hailMary", "1"],
      ["hailMary", "2"],
      ["hailMary", "3"],
    ];
    expect(parseRespects(form(prayers))).toEqual({ ok: false, error: expect.stringContaining("offering") });
    expect(parseRespects(form([...prayers, ["offering", "speedboat"]])).ok).toBe(false);
  });

  it("picks a stable blessing for every id", () => {
    expect(blessingFor(1)).toBe(blessingFor(1 + BLESSINGS.length));
    expect(BLESSINGS).toContain(blessingFor(123_456));
    expect(BLESSINGS).toContain(blessingFor(Number.NaN));
  });

  it("keeps one candle lit and never more than the shelf holds", () => {
    expect(litCandles(0)).toBe(1);
    expect(litCandles(2)).toBe(3);
    expect(litCandles(1_000)).toBe(CANDLE_COUNT);
    expect(litCandles(Number.NaN)).toBe(1);
    expect(litCandles(-3)).toBe(1);
  });

  it("tallies offerings in altar order and ignores unknown ones", () => {
    const tally = tallyOfferings([
      { offering: "horse", n: 2 },
      { offering: "tea", n: 5 },
      { offering: "speedboat", n: 9 },
    ]);
    expect(tally.map((t) => t.offering.id)).toEqual(OFFERINGS.map((o) => o.id));
    expect(tally.find((t) => t.offering.id === "tea")?.n).toBe(5);
    expect(tally.find((t) => t.offering.id === "horse")?.n).toBe(2);
    expect(tally.reduce((sum, t) => sum + t.n, 0)).toBe(7);
  });

  it("pluralises", () => {
    expect(plural(1, "pilgrim")).toBe("1 pilgrim");
    expect(plural(0, "pilgrim")).toBe("0 pilgrims");
    expect(plural(1200, "Hail Mary", "Hail Marys")).toBe("1,200 Hail Marys");
  });
});

describe("formatRegisterTime", () => {
  it("formats in UTC and tolerates junk", () => {
    expect(formatRegisterTime("2026-10-17T09:05:00Z")).toBe("17 Oct, 09:05 UTC");
    expect(formatRegisterTime("2026-01-01T23:59:59+02:00")).toBe("1 Jan, 21:59 UTC");
    expect(formatRegisterTime("not a date")).toBe("");
  });
});

import { describe, expect, it } from "vitest";

import { loadBuilds, parseBuilds, type BuildEntry } from "./builds";

const entry = (overrides: Partial<BuildEntry> = {}): BuildEntry => ({
  day: "2026-10-15",
  ideaId: 1,
  title: "A guestbook",
  author: "octocat",
  prUrl: "https://github.com/oojam-dev/oojam/pull/1",
  summary: "Visitors can leave a short note.",
  ...overrides,
});

describe("parseBuilds", () => {
  it("accepts an empty changelog", () => {
    expect(parseBuilds([])).toEqual([]);
  });

  it("returns entries newest first", () => {
    const builds = parseBuilds([
      entry({ day: "2026-10-15", ideaId: 1 }),
      entry({ day: "2026-10-17", ideaId: 3 }),
      entry({ day: "2026-10-16", ideaId: 2 }),
    ]);
    expect(builds.map((b) => b.day)).toEqual(["2026-10-17", "2026-10-16", "2026-10-15"]);
  });

  it("orders same-day entries by idea id, highest first", () => {
    expect(parseBuilds([entry({ ideaId: null, author: "oojam-dev" })])[0]!.ideaId).toBeNull();
    const builds = parseBuilds([entry({ ideaId: 4 }), entry({ ideaId: 9 })]);
    expect(builds.map((b) => b.ideaId)).toEqual([9, 4]);
  });

  it("keeps only known fields", () => {
    const [build] = parseBuilds([{ ...entry(), extra: "ignored" }]);
    expect(build).toEqual(entry());
  });

  it("rejects data that isn't an array", () => {
    expect(() => parseBuilds({})).toThrow(/must be a JSON array/);
  });

  it.each([
    ["day", { day: "15/10/2026" }],
    ["day", { day: "2026-13-45" }],
    ["ideaId", { ideaId: 0 }],
    ["ideaId", { ideaId: undefined as unknown as number }],
    ["ideaId", { ideaId: "7" as unknown as number }],
    ["title", { title: "  " }],
    ["author", { author: "not a login" }],
    ["author", { author: "-leading" }],
    ["prUrl", { prUrl: "javascript:alert(1)" }],
    ["prUrl", { prUrl: "https://evil.example/oojam/pull/1" }],
    ["prUrl", { prUrl: "http://github.com/oojam-dev/oojam/pull/1" }],
    ["summary", { summary: undefined as unknown as string }],
  ])("rejects a bad %s", (field, overrides) => {
    expect(() => parseBuilds([entry(overrides)])).toThrow(new RegExp(`entry 0: "${field}"`));
  });
});

describe("loadBuilds", () => {
  it("parses the committed content/builds.json", () => {
    expect(Array.isArray(loadBuilds())).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { formatCountdown, nextBuildAt } from "./countdown";

describe("countdown", () => {
  it("targets the next 00:00 UTC", () => {
    expect(nextBuildAt(new Date("2026-10-14T23:59:59Z")).toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(nextBuildAt(new Date("2026-10-15T00:00:00Z")).toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(nextBuildAt(new Date("2026-12-31T12:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("formats HH:MM:SS and never goes negative", () => {
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
    expect(formatCountdown(86_399_999)).toBe("23:59:59");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });
});

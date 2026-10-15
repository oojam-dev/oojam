import { afterEach, describe, expect, it, vi } from "vitest";

import { loader } from "./_health";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /_health", () => {
  it("reports ok and the sha when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("GIT_SHA", "abc123def456");
    const response = await loader();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, sha: "abc123def456" });
  });

  it("falls back to sha \"dev\"", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("GIT_SHA", undefined);
    const response = await loader();
    expect(await response.json()).toEqual({ ok: true, sha: "dev" });
  });
});

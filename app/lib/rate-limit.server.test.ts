import { describe, expect, it } from "vitest";

import { clientIp, createRateLimiter, enforceRateLimit } from "./rate-limit.server";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/", { headers });

describe("createRateLimiter", () => {
  it("allows a burst up to capacity, then refuses", () => {
    const limiter = createRateLimiter({ capacity: 3, refillPerMinute: 1 });
    const t = 1_000_000;
    expect([1, 2, 3].map(() => limiter.take("a", 1, t).ok)).toEqual([true, true, true]);
    const refused = limiter.take("a", 1, t);
    expect(refused.ok).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSeconds).toBe(60);
  });

  it("refills over time, up to capacity", () => {
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 60 }); // 1 per second
    const t = 1_000_000;
    limiter.take("a", 1, t);
    limiter.take("a", 1, t);
    expect(limiter.take("a", 1, t).ok).toBe(false);
    expect(limiter.take("a", 1, t + 1_000).ok).toBe(true);
    // A long wait never banks more than capacity.
    expect(limiter.take("a", 1, t + 3_600_000).remaining).toBe(1);
  });

  it("keeps clients separate", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 1 });
    expect(limiter.take("a", 1, 0).ok).toBe(true);
    expect(limiter.take("a", 1, 0).ok).toBe(false);
    expect(limiter.take("b", 1, 0).ok).toBe(true);
  });

  it("drops the least recently seen clients beyond maxKeys", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 1, maxKeys: 2 });
    limiter.take("a", 1, 0);
    limiter.take("b", 1, 0);
    limiter.take("c", 1, 0); // evicts "a"
    expect(limiter.take("a", 1, 0).ok).toBe(true);
    expect(limiter.take("c", 1, 0).ok).toBe(false);
  });

  it("rejects nonsense options", () => {
    expect(() => createRateLimiter({ capacity: 0, refillPerMinute: 1 })).toThrow();
    expect(() => createRateLimiter({ capacity: 1, refillPerMinute: -1 })).toThrow();
  });
});

describe("clientIp", () => {
  it("uses the first X-Forwarded-For hop", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" }))).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP, then unknown", () => {
    expect(clientIp(req({ "x-real-ip": " 198.51.100.4 " }))).toBe("198.51.100.4");
    expect(clientIp(req())).toBe("unknown");
    expect(clientIp(req({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  it("throws a 429 Response with Retry-After once the bucket is empty", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 2 });
    const request = req({ "x-forwarded-for": "203.0.113.7" });
    enforceRateLimit(request, limiter, "post");
    let thrown: unknown;
    try {
      enforceRateLimit(request, limiter, "post");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(429);
    expect(Number((thrown as Response).headers.get("Retry-After"))).toBeGreaterThan(0);
    // A different scope has its own bucket.
    expect(() => enforceRateLimit(request, limiter, "report")).not.toThrow();
  });
});

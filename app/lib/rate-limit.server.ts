/**
 * Per-IP rate limiting for anything visitors can trigger repeatedly: posting, reporting,
 * voting, searching. In memory, so limits reset on deploy, which is fine for spam control.
 *
 * Usage, in an action:
 *
 *   import { createRateLimiter, enforceRateLimit } from "~/lib/rate-limit.server";
 *
 *   // Module scope, so the buckets persist between requests: a burst of 5, then 1 every 30 s.
 *   const postLimiter = createRateLimiter({ capacity: 5, refillPerMinute: 2 });
 *
 *   export async function action({ request }: Route.ActionArgs) {
 *     enforceRateLimit(request, postLimiter); // throws a 429 Response when over the limit
 *     ...
 *   }
 */

export type RateLimiterOptions = {
  /** Requests allowed in a burst (the bucket size). */
  capacity: number;
  /** Tokens added back per minute. */
  refillPerMinute: number;
  /** Most clients tracked at once; the least recently seen are dropped first. */
  maxKeys?: number;
};

export type RateLimitResult = {
  ok: boolean;
  /** Whole tokens left after this request. */
  remaining: number;
  /** Seconds until a request would be allowed again (0 when ok). */
  retryAfterSeconds: number;
};

export type RateLimiter = {
  /** Spends `cost` tokens (default 1) for `key`. `now` is for tests. */
  take(key: string, cost?: number, now?: number): RateLimitResult;
  /** Forgets every client. For tests. */
  reset(): void;
};

type Bucket = { tokens: number; updatedAt: number };

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { capacity, refillPerMinute, maxKeys = 10_000 } = options;
  if (!(capacity > 0) || !(refillPerMinute > 0) || !(maxKeys > 0)) {
    throw new Error("createRateLimiter: capacity, refillPerMinute and maxKeys must be positive");
  }
  const refillPerMs = refillPerMinute / 60_000;
  const buckets = new Map<string, Bucket>();

  return {
    take(key, cost = 1, now = Date.now()) {
      const previous = buckets.get(key);
      const bucket: Bucket = previous
        ? {
            tokens: Math.min(capacity, previous.tokens + Math.max(0, now - previous.updatedAt) * refillPerMs),
            updatedAt: now,
          }
        : { tokens: capacity, updatedAt: now };

      const ok = bucket.tokens >= cost;
      if (ok) bucket.tokens -= cost;

      // Re-insert so Map order is least-recently-seen first, then trim the oldest.
      buckets.delete(key);
      buckets.set(key, bucket);
      while (buckets.size > maxKeys) {
        const oldest = buckets.keys().next().value;
        if (oldest === undefined) break;
        buckets.delete(oldest);
      }

      return {
        ok,
        remaining: Math.floor(bucket.tokens),
        retryAfterSeconds: ok ? 0 : Math.ceil((cost - bucket.tokens) / refillPerMs / 1000),
      };
    },
    reset() {
      buckets.clear();
    },
  };
}

/**
 * The visitor's IP address. The site only runs behind the oojam edge proxy, which sets
 * X-Forwarded-For to the real client address, so the first hop is the client.
 * Falls back to X-Real-IP, then "unknown" (all unknown clients then share one bucket).
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

/**
 * Takes a token for this request's IP, or throws a 429 Response with Retry-After.
 * `scope` lets one limiter serve several actions with separate buckets.
 */
export function enforceRateLimit(request: Request, limiter: RateLimiter, scope = ""): void {
  const result = limiter.take(`${scope}|${clientIp(request)}`);
  if (!result.ok) {
    throw new Response("Too many requests. Please wait a moment and try again.", {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds), "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

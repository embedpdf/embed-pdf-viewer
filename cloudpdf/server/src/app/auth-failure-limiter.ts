/**
 * Per-client throttle on authentication FAILURES, not requests.
 *
 * Rationale: legitimate traffic presents valid tokens and is never counted,
 * so the limiter needs no tuning against peak RPS — only sources that keep
 * producing 401s (token spray, endpoint probing, JWKS kid-miss spam) accrue
 * count. This makes generous defaults safe even behind a mis-set proxy where
 * many clients share one observed IP: valid-token requests from that IP keep
 * working until the *failure* budget is exhausted.
 *
 * Fixed window per key, in-process only. Each replica protects its own CPU,
 * which is the resource at stake; cross-replica fairness quotas belong at
 * the edge (WAF / ingress), not here.
 */
export interface AuthFailureLimiterOptions {
  /** Failures allowed per window per key before requests are rejected. */
  maxFailures: number;
  /** Window length in ms; the block lasts until the window expires. */
  windowMs: number;
  /**
   * Bound on tracked keys (roughly: distinct failing IPs per window).
   * When exceeded, expired windows are swept and, if still over, the
   * oldest entries dropped — memory stays bounded under address-spray.
   */
  maxEntries?: number;
}

interface Bucket {
  windowStart: number;
  count: number;
}

export class AuthFailureLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxEntries: number;

  constructor(
    private readonly opts: AuthFailureLimiterOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.maxEntries = opts.maxEntries ?? 10_000;
  }

  /**
   * Milliseconds until `key` may try again; 0 when not blocked. Read-only —
   * rejected requests do not extend the block (the block ends with the
   * window, so a legitimate client behind a noisy NAT recovers quickly).
   */
  retryAfterMs(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    const elapsed = this.now() - bucket.windowStart;
    if (elapsed >= this.opts.windowMs) return 0;
    return bucket.count >= this.opts.maxFailures ? this.opts.windowMs - elapsed : 0;
  }

  recordFailure(key: string): void {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (bucket && now - bucket.windowStart < this.opts.windowMs) {
      bucket.count += 1;
      return;
    }
    if (!bucket && this.buckets.size >= this.maxEntries) this.sweep(now);
    this.buckets.set(key, { windowStart: now, count: 1 });
  }

  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.opts.windowMs) this.buckets.delete(key);
    }
    if (this.buckets.size < this.maxEntries) return;
    // Every window still live: drop the oldest entries (Map preserves
    // insertion order) rather than growing without bound.
    const excess = this.buckets.size - this.maxEntries + 1;
    let dropped = 0;
    for (const key of this.buckets.keys()) {
      if (dropped++ >= excess) break;
      this.buckets.delete(key);
    }
  }
}

/**
 * Per-key throttle on request ATTEMPTS — the volume tier in front of
 * public endpoints that do real work before any credential can be
 * checked (grant lookups, scrypt verification).
 *
 * Sibling of `AuthFailureLimiter` with one deliberate structural
 * difference: where the failure limiter separates the read-only block
 * check from failure recording (right for "count only outcomes the
 * handler has already classified"), `consume()` counts and decides in
 * ONE synchronous step. Placed before a handler's first `await` it is
 * atomic under concurrent bursts — no interleaving can let N requests
 * pass the check before any of them is counted.
 *
 * Counting attempts rather than failures is what makes this the volume
 * tier: outcomes deliberately exempt from probe counting (a stale
 * embed's 404s, a passphrase prompt's first 422 roundtrip) still
 * consume budget, so no request shape can demand unbounded work.
 * Budgets are therefore generous where the failure limiter's are
 * strict — legitimate traffic must never notice this tier.
 *
 * Fixed window per key, in-process only. Each replica bounds its own
 * CPU/DB fan-out; cross-replica fairness quotas belong at the edge
 * (WAF / ingress), same doctrine as the failure limiter.
 */
export interface RequestRateLimiterOptions {
  /** Attempts allowed per window per key; the next attempt blocks. */
  maxAttempts: number;
  /** Window length in ms; a block lasts until the window expires. */
  windowMs: number;
  /**
   * Bound on tracked keys (roughly: distinct active keys per window).
   * When exceeded, expired windows are swept and, if still over, the
   * oldest entries dropped — memory stays bounded under key-spray.
   */
  maxEntries?: number;
}

interface Bucket {
  windowStart: number;
  count: number;
}

export class RequestRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxEntries: number;

  constructor(
    private readonly opts: RequestRateLimiterOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.maxEntries = opts.maxEntries ?? 10_000;
  }

  /**
   * Count one attempt and answer for it: 0 = proceed, >0 = blocked for
   * that many ms. Blocked attempts do not extend the block — the
   * window is fixed from its first attempt, so a busy key recovers the
   * moment the window rolls over.
   */
  consume(key: string): number {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.opts.windowMs) {
      if (!bucket && this.buckets.size >= this.maxEntries) this.sweep(now);
      this.buckets.set(key, { windowStart: now, count: 1 });
      return 0;
    }
    if (bucket.count >= this.opts.maxAttempts) {
      return this.opts.windowMs - (now - bucket.windowStart);
    }
    bucket.count += 1;
    return 0;
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

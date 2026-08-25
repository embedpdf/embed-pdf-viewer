import type { CgroupMemory } from './cgroup-memory';
import type { EngineHostClient, RecycleReason } from './EngineHostClient';

/**
 * C2 — the recycle POLICY (the mechanism lives in
 * `EngineHostClient.recycle()`, which is a rehearsed crash: no journal
 * strike, no attribution, no backoff).
 *
 * Policy law (review-corrected): the CGROUP triggers, RSS attributes.
 * Total pressure is this container's working set over its limit —
 * individual process RSS double-counts shared pages and is only used to
 * pick the victim (largest heartbeat). The explicit per-host RSS limit
 * is a SECONDARY guard; lifetime recycling (jittered) is the cheap hedge
 * against slow leaks and ships OFF until soak data sets a default.
 *
 * OPT-IN: the recycler runs only when explicitly configured
 * (`CLOUDPDF_ENGINE_RECYCLE=1` or any knob env present). Telemetry
 * (heartbeat + gauges) ships regardless — that is step 0.
 *
 * Honest limits: pressure includes the API process's own memory — if the
 * API alone exceeds the watermark, recycling engines cannot relieve it;
 * the cooldown keeps that from becoming a recycle storm, and the gauges
 * make it visible.
 */
export interface EngineRecyclePolicy {
  /** Graceful recycle at this % of the container working-set/limit. */
  softPct?: number; // default 70
  /** Hard recycle (immediate kill) at this %. */
  hardPct?: number; // default 85
  /** Optional per-host RSS secondary guard (graceful). */
  maxRssBytes?: number;
  /** Jittered max host lifetime; 0/undefined = off (soak decides the default). */
  maxLifetimeMs?: number;
  /** In-flight settle window for graceful recycles. Default 3s: settle +
   *  bounded shutdown + successor boot must fit inside the parked-dispatch
   *  deadline (10s) and the readiness persistence threshold (10s). */
  settleWindowMs?: number; // default 3_000
  /** Evaluation cadence. */
  intervalMs?: number; // default 10_000
  /** Minimum spacing between recycles — the thrash guard. */
  cooldownMs?: number; // default 60_000
  /** Spacing for HARD (kill-now) decisions: sustained hard cgroup
   *  pressure must not wait a full soft cooldown between shard kills —
   *  re-evaluate shortly after each replacement is ready. */
  cooldownHardMs?: number; // default 10_000
  /** Injectable jitter (tests); returns [0,1). */
  jitter?: () => number;
}

export interface RecycleDecision {
  reason: RecycleReason;
  graceful: boolean;
}

export class EngineRecycler {
  private timer: NodeJS.Timeout | undefined;
  private lastRecycleAt = 0;
  /** The most recent victim. NO further decision of any kind until its
   *  successor reports ready — otherwise, under sustained pressure, the
   *  mid-respawn victim has no RSS reading, victim selection falls on a
   *  SIBLING, and the recycler cascades holes through the fleet (one
   *  concurrent hole is the whole contract). A crash-looping successor
   *  deliberately pins recycling OFF — recycling beside a crash loop is
   *  noise on top of an incident. */
  private lastVictim: EngineHostClient | null = null;
  /** Per-host jittered lifetime deadline, keyed by client identity. */
  private readonly lifetimeFactor = new WeakMap<EngineHostClient, number>();
  private readonly cfg: Required<
    Omit<EngineRecyclePolicy, 'maxRssBytes' | 'maxLifetimeMs' | 'jitter'>
  > &
    Pick<EngineRecyclePolicy, 'maxRssBytes' | 'maxLifetimeMs'>;
  private readonly jitter: () => number;

  constructor(
    /** The recyclable fleet — today `[engineHost]`; C3 slots in here. */
    private readonly hosts: () => EngineHostClient[],
    private readonly cgroup: () => CgroupMemory | null,
    policy: EngineRecyclePolicy = {},
    private readonly onDecision?: (d: RecycleDecision) => void,
    /** A policy/tick failure must never become an unhandled rejection. */
    private readonly onError?: (err: unknown) => void,
  ) {
    this.cfg = {
      softPct: policy.softPct ?? 70,
      hardPct: policy.hardPct ?? 85,
      settleWindowMs: policy.settleWindowMs ?? 3_000,
      intervalMs: policy.intervalMs ?? 10_000,
      cooldownMs: policy.cooldownMs ?? 60_000,
      cooldownHardMs: policy.cooldownHardMs ?? 10_000,
      maxRssBytes: policy.maxRssBytes,
      maxLifetimeMs: policy.maxLifetimeMs,
    };
    this.jitter = policy.jitter ?? Math.random;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.onError?.(err));
    }, this.cfg.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One evaluation; exposed for tests. At most ONE recycle per tick. */
  async tick(now = Date.now()): Promise<RecycleDecision | null> {
    // Recovery gate FIRST: the previous victim's successor must be ready
    // before ANY new decision (see `lastVictim`). recycle() refusing the
    // same non-ready host is not enough — decide() would simply pick a
    // sibling and open a second concurrent hole.
    if (this.lastVictim !== null) {
      if (this.lastVictim.health().state !== 'ready') return null;
      this.lastVictim = null;
    }
    const sinceLast = now - this.lastRecycleAt;
    if (sinceLast < this.cfg.cooldownHardMs) return null;
    const clients = this.hosts();
    const decision = this.decide(clients, now);
    if (!decision) return null;
    // Soft/lifetime decisions respect the full cooldown; HARD pressure
    // only waits the short one — plus the recovery gate above.
    if (decision.graceful && sinceLast < this.cfg.cooldownMs) return null;
    const ok = await decision.victim.recycle(decision.reason, {
      graceful: decision.graceful,
      settleWindowMs: this.cfg.settleWindowMs,
    });
    if (!ok) return null; // host not recyclable right now — later tick retries
    this.lastRecycleAt = now;
    this.lastVictim = decision.victim;
    const d = { reason: decision.reason, graceful: decision.graceful };
    this.onDecision?.(d);
    return d;
  }

  private decide(
    clients: EngineHostClient[],
    now: number,
  ): { victim: EngineHostClient; reason: RecycleReason; graceful: boolean } | null {
    // Victim selection needs a heartbeat: no reading, no attribution.
    const withRss = clients
      .map((c) => ({ c, rss: c.memory()?.rssBytes ?? null }))
      .filter((e): e is { c: EngineHostClient; rss: number } => e.rss !== null)
      .sort((a, b) => b.rss - a.rss);
    const largest = withRss[0];

    const cg = this.cgroup();
    if (cg && cg.limitBytes !== null && cg.limitBytes > 0 && largest) {
      const pct = (cg.workingSetBytes / cg.limitBytes) * 100;
      if (pct >= this.cfg.hardPct) {
        return { victim: largest.c, reason: 'hard-rss', graceful: false };
      }
      if (pct >= this.cfg.softPct) {
        return { victim: largest.c, reason: 'soft-rss', graceful: true };
      }
    }
    if (this.cfg.maxRssBytes !== undefined && largest && largest.rss >= this.cfg.maxRssBytes) {
      return { victim: largest.c, reason: 'soft-rss', graceful: true };
    }
    if (this.cfg.maxLifetimeMs !== undefined && this.cfg.maxLifetimeMs > 0) {
      for (const c of clients) {
        const uptime = c.uptimeMs();
        if (uptime === null) continue;
        let factor = this.lifetimeFactor.get(c);
        if (factor === undefined) {
          factor = 0.8 + 0.4 * this.jitter(); // ±20%
          this.lifetimeFactor.set(c, factor);
        }
        if (uptime >= this.cfg.maxLifetimeMs * factor) {
          this.lifetimeFactor.delete(c); // fresh jitter for the successor
          return { victim: c, reason: 'lifetime', graceful: true };
        }
      }
    }
    void now;
    return null;
  }
}

export interface ResolvedRecycleConfig {
  enabled: boolean;
  policy: EngineRecyclePolicy;
  warnings: string[];
}

/**
 * Boot-time env validation (the `resolveQuarantineConfig` pattern —
 * exported because the bin is not importable by tests). Throws on
 * misconfiguration; the bin maps throws to exit(2).
 */
export function resolveRecycleConfig(
  env: NodeJS.ProcessEnv,
  engineIsolation: 'inline' | 'host',
  cgroupProbe: () => CgroupMemory | null,
): ResolvedRecycleConfig {
  const warnings: string[] = [];
  const knobs = [
    'CLOUDPDF_ENGINE_RECYCLE_SOFT_PCT',
    'CLOUDPDF_ENGINE_RECYCLE_HARD_PCT',
    'CLOUDPDF_ENGINE_MAX_RSS_MB',
    'CLOUDPDF_ENGINE_MAX_LIFETIME_HOURS',
  ];
  const master = env['CLOUDPDF_ENGINE_RECYCLE'];
  if (master !== undefined && !['1', 'true', '0', 'false', ''].includes(master)) {
    throw new Error(
      `CLOUDPDF_ENGINE_RECYCLE must be 1/true/0/false, got ${JSON.stringify(master)} — a typo here must not silently disable recycling`,
    );
  }
  const anyKnob = knobs.some((k) => env[k] !== undefined && env[k] !== '');
  if (master === '0' || master === 'false') {
    return { enabled: false, policy: {}, warnings };
  }
  const enabled =
    master === '1' || master === 'true' || ((master === undefined || master === '') && anyKnob);
  if (!enabled) return { enabled: false, policy: {}, warnings };

  if (engineIsolation !== 'host') {
    throw new Error(
      'engine recycling requires CLOUDPDF_ENGINE_ISOLATION=host — there is no child process to recycle inline',
    );
  }
  const pct = (name: string, dflt: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return dflt;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n >= 100) {
      throw new Error(`${name} must be a percentage in (0, 100), got ${JSON.stringify(raw)}`);
    }
    return n;
  };
  const softPct = pct('CLOUDPDF_ENGINE_RECYCLE_SOFT_PCT', 70);
  const hardPct = pct('CLOUDPDF_ENGINE_RECYCLE_HARD_PCT', 85);
  if (softPct >= hardPct) {
    throw new Error(
      `CLOUDPDF_ENGINE_RECYCLE_SOFT_PCT (${softPct}) must be below CLOUDPDF_ENGINE_RECYCLE_HARD_PCT (${hardPct})`,
    );
  }
  const positive = (name: string): number | undefined => {
    const raw = env[name];
    if (raw === undefined || raw === '') return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`${name} must be a non-negative number, got ${JSON.stringify(raw)}`);
    }
    return n;
  };
  const maxRssMb = positive('CLOUDPDF_ENGINE_MAX_RSS_MB');
  if (maxRssMb !== undefined && maxRssMb <= 0) {
    throw new Error(
      `CLOUDPDF_ENGINE_MAX_RSS_MB must be greater than zero (0 would recycle every cooldown), got ${maxRssMb}`,
    );
  }
  const lifetimeHours = positive('CLOUDPDF_ENGINE_MAX_LIFETIME_HOURS');

  const cg = cgroupProbe();
  const cgroupUsable = cg !== null && cg.limitBytes !== null && cg.limitBytes > 0;
  const hasPressureSource =
    cgroupUsable || maxRssMb !== undefined || (lifetimeHours !== undefined && lifetimeHours > 0);
  if (!hasPressureSource) {
    throw new Error(
      'engine recycling is enabled but has NO pressure source: no readable cgroup memory limit, ' +
        'no CLOUDPDF_ENGINE_MAX_RSS_MB, no CLOUDPDF_ENGINE_MAX_LIFETIME_HOURS — it would never fire. ' +
        'Set a limit or disable CLOUDPDF_ENGINE_RECYCLE.',
    );
  }
  if (!cgroupUsable) {
    warnings.push(
      'engine recycling: no readable cgroup memory limit — watermark recycling is inert; ' +
        'running on explicit RSS/lifetime limits only',
    );
  }
  return {
    enabled: true,
    policy: {
      softPct,
      hardPct,
      ...(maxRssMb !== undefined ? { maxRssBytes: maxRssMb * 1024 * 1024 } : {}),
      ...(lifetimeHours !== undefined && lifetimeHours > 0
        ? { maxLifetimeMs: lifetimeHours * 3_600_000 }
        : {}),
    },
    warnings,
  };
}

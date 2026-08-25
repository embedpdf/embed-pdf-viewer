import { createHash } from 'node:crypto';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { WorkerResultPayload } from '@embedpdf/engine-core/runtime';

import type { EngineHostClient, HostCrashEvent } from './EngineHostClient';
import type { BuildPack, EnginePool, RunAdHocOptions } from './EnginePool';

/**
 * C3 — the blast-radius dial: K supervised engine hosts behind a routing
 * veneer.
 *
 * THE LAW: this composite adds routing, never lifecycle. It has exactly
 * three responsibilities — PICK (rendezvous route), REMEMBER (sticky
 * docId → shard), FORGET PRECISELY (scope a dead shard's residents into
 * the restart hook). Respawn, backoff, drain, recycle, heartbeat,
 * journal attribution all stay per-host in `EngineHostClient`; any diff
 * that teaches this class about them is wrong by construction.
 *
 * Routing decisions (plan `2026-08-26-ws3-c3-sharded-engine.md`, review
 * round 1):
 *  - The isolation key is `docId` — resident isolation beats base
 *    sharing (a viral template must not collapse its thousands of
 *    documents onto one shard). A hot base may be parsed on up to K
 *    shards; within a shard the worker tier's base-sha affinity still
 *    coalesces.
 *  - `runAdHoc(baseSha)` routes by `baseSha` separately (stateless
 *    one-shot work clusters by content); sha-less ad-hoc round-robins
 *    among READY shards.
 *  - Scores are SHA-256-derived (first 8 bytes as a BigUint):
 *    FNV-1a-with-suffix rendezvous is materially biased (reproduced:
 *    K=3 ≈ 25/25/50 — one-byte-suffix candidates keep near-constant
 *    score offsets).
 *
 * A `run()` against a doc with no sticky entry throws `DocNotOpen`
 * LOCALLY (no dispatch): sticky and residency are updated together, so
 * a miss means "not open anywhere" — `readOnPool`'s reopen-retry
 * re-routes and re-sticks.
 */

/** Rendezvous score: well-mixed, stable, computed at open time only. */
export function shardScore(key: string, shard: number): bigint {
  return createHash('sha256').update(`${key}:${shard}`).digest().readBigUInt64BE(0);
}

export function pickShard(key: string, count: number): number {
  let best = -1n;
  let pick = 0;
  for (let i = 0; i < count; i++) {
    const s = shardScore(key, i);
    if (s > best) {
      best = s;
      pick = i;
    }
  }
  return pick;
}

/** Per-shard hooks the composite intercepts before forwarding up. */
export interface ShardHooks {
  onEvict: (evt: { docId: string; baseSha: string; slot: number }) => void;
  onHostCrash: (evt: HostCrashEvent) => void;
  onHostRestart: () => void;
}

export interface ShardedEnginePoolOptions {
  count: number;
  /** buildApp owns boot config; the composite owns hook interception. */
  spawn: (shard: number, hooks: ShardHooks) => Promise<EngineHostClient>;
  /** Upstream reactions, called ONCE per event with shard context. */
  onEvict?: (evt: { docId: string; baseSha: string; slot: number; shard: number }) => void;
  onHostCrash?: (evt: HostCrashEvent & { shard: number }) => void;
  /** Fired per shard restart with THAT shard's residents (the scope). */
  onHostRestart?: (scope: { docIds: ReadonlySet<string> }, shard: number) => void;
}

export class ShardedEnginePool implements EnginePool {
  private readonly shardOf = new Map<string, number>();
  private rr = 0;
  private destroyed = false;

  private constructor(
    private readonly clients: EngineHostClient[],
    private readonly opts: ShardedEnginePoolOptions,
  ) {}

  static async create(opts: ShardedEnginePoolOptions): Promise<ShardedEnginePool> {
    if (!Number.isInteger(opts.count) || opts.count < 2) {
      throw new Error(`ShardedEnginePool: count must be an integer ≥ 2, got ${opts.count}`);
    }
    const clients: Array<EngineHostClient | null> = new Array(opts.count).fill(null);
    // The instance exists before the children so hooks can close over it;
    // no dispatch happens until create() returns.
    const pool = new ShardedEnginePool(clients as EngineHostClient[], opts);
    const settled = await Promise.allSettled(
      Array.from({ length: opts.count }, (_, shard) =>
        opts.spawn(shard, pool.hooksFor(shard)).then((c) => {
          clients[shard] = c;
          return c;
        }),
      ),
    );
    const failures = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (failures.length > 0) {
      // allSettled, not all: a sibling that SUCCEEDS after the first
      // failure would otherwise become an orphan supervisor respawning
      // forever. Every fulfilled client gets reaped here.
      await Promise.allSettled(clients.filter((c) => c !== null).map((c) => c!.destroy()));
      const primary = failures[0]!.reason as Error;
      if (failures.length > 1) {
        primary.message += ` (+${failures.length - 1} more shard boot failures)`;
      }
      throw primary;
    }
    return pool;
  }

  private hooksFor(shard: number): ShardHooks {
    return {
      onEvict: (evt) => {
        this.shardOf.delete(evt.docId);
        this.opts.onEvict?.({ ...evt, shard });
      },
      onHostCrash: (evt) => {
        this.opts.onHostCrash?.({ ...evt, shard });
      },
      onHostRestart: () => {
        // Snapshot THIS shard's residents BEFORE clearing them (the
        // suspects pattern) — that snapshot IS the forget scope.
        const docIds = new Set<string>();
        for (const [docId, s] of this.shardOf) {
          if (s === shard) docIds.add(docId);
        }
        for (const docId of docIds) this.shardOf.delete(docId);
        this.opts.onHostRestart?.({ docIds }, shard);
      },
    };
  }

  private client(shard: number): EngineHostClient {
    return this.clients[shard]!;
  }

  runOpen(
    docId: string,
    baseSha: string,
    build: BuildPack,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload>;
  runOpen(docId: string, build: BuildPack, signal?: AbortSignal): Promise<WorkerResultPayload>;
  async runOpen(
    docId: string,
    a: string | BuildPack,
    b?: BuildPack | AbortSignal,
    c?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    const shard = this.shardOf.get(docId) ?? pickShard(docId, this.clients.length);
    const target = this.client(shard);
    const result =
      typeof a === 'string'
        ? await target.runOpen(docId, a, b as BuildPack, c)
        : await target.runOpen(docId, a, b as AbortSignal | undefined);
    this.shardOf.set(docId, shard); // stick on SUCCESS only
    return result;
  }

  run(docId: string, build: BuildPack, signal?: AbortSignal): Promise<WorkerResultPayload> {
    const shard = this.shardOf.get(docId);
    if (shard === undefined) {
      // Not resident anywhere by construction — no dispatch, no guessing;
      // readOnPool's reopen-retry re-routes and re-sticks.
      return Promise.reject(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${docId}`),
      );
    }
    return this.client(shard).run(docId, build, signal);
  }

  runAdHoc(
    baseSha: string | undefined,
    build: BuildPack,
    signal?: AbortSignal,
    opts?: RunAdHocOptions,
  ): Promise<WorkerResultPayload> {
    const shard =
      baseSha !== undefined ? pickShard(baseSha, this.clients.length) : this.nextReadyRR();
    return this.client(shard).runAdHoc(baseSha, build, signal, opts);
  }

  /** Sha-less ad-hoc: round-robin among READY shards (no affinity reason
   *  to park stateless work on a known-down host); all down → shard 0
   *  (its parked-dispatch machinery gives the honest wait/timeout). */
  private nextReadyRR(): number {
    const n = this.clients.length;
    for (let i = 0; i < n; i++) {
      const shard = (this.rr + i) % n;
      if (this.client(shard).health().state === 'ready') {
        this.rr = (shard + 1) % n;
        return shard;
      }
    }
    return this.rr++ % n;
  }

  async close(docId: string, signal?: AbortSignal): Promise<WorkerResultPayload | null> {
    const shard = this.shardOf.get(docId);
    if (shard === undefined) return null;
    this.shardOf.delete(docId);
    return this.client(shard).close(docId, signal);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    await Promise.allSettled(this.clients.map((c) => c.destroy()));
    this.shardOf.clear();
  }

  inspect(): Array<{ slot: number; docIds: string[]; baseShas: string[] }> {
    // Shard-offset slot ids keep them unique across the fleet.
    const out: Array<{ slot: number; docIds: string[]; baseShas: string[] }> = [];
    this.clients.forEach((c, shard) => {
      for (const s of c.inspect()) out.push({ ...s, slot: shard * 1000 + s.slot });
    });
    return out;
  }

  stats(): { slots: number; docs: number; inFlight: number } {
    return this.clients.reduce(
      (acc, c) => {
        const s = c.stats();
        return {
          slots: acc.slots + s.slots,
          docs: acc.docs + s.docs,
          inFlight: acc.inFlight + s.inFlight,
        };
      },
      { slots: 0, docs: 0, inFlight: 0 },
    );
  }

  generation(): number {
    return Math.max(...this.clients.map((c) => c.generation()));
  }

  generationFor(docId: string): number {
    const shard = this.shardOf.get(docId);
    // -1: no real generation ever takes it — a bless-time compare against
    // a captured generation always refuses when the doc's shard died.
    return shard === undefined ? -1 : this.client(shard).generation();
  }

  health(): { state: 'ready' | 'starting' | 'backoff'; downSinceMs: number | null } {
    // ANY shard persistently down → unready: deterministic routing with
    // no failover makes one dead shard a deterministic partial outage.
    // downSinceMs is an ELAPSED duration → aggregate with max (the
    // longest-down shard drives the persistence threshold).
    let worst: 'ready' | 'starting' | 'backoff' = 'ready';
    let downMs: number | null = null;
    for (const c of this.clients) {
      const h = c.health();
      if (h.state === 'backoff') worst = 'backoff';
      else if (h.state === 'starting' && worst === 'ready') worst = 'starting';
      if (h.downSinceMs !== null) downMs = Math.max(downMs ?? 0, h.downSinceMs);
    }
    return { state: worst, downSinceMs: downMs };
  }

  /** Aggregate heartbeat: SUM, but only when EVERY shard has a reading —
   *  a partial sum silently under-reports. Age = the OLDEST beat. */
  memory(): { rssBytes: number; heapUsedBytes: number; ageMs: number } | null {
    let rss = 0;
    let heap = 0;
    let age = 0;
    for (const c of this.clients) {
      const m = c.memory();
      if (m === null) return null;
      rss += m.rssBytes;
      heap += m.heapUsedBytes;
      age = Math.max(age, m.ageMs);
    }
    return { rssBytes: rss, heapUsedBytes: heap, ageMs: age };
  }

  /** The fleet, for the recycler and per-shard telemetry. */
  hosts(): EngineHostClient[] {
    return [...this.clients];
  }
}

import { randomUUID } from 'node:crypto';

import type { Kysely } from 'kysely';

import type { Database as Schema } from '../db/schema';
import type { HostCrashEvent } from '../runtime/EngineHostClient';

/**
 * Refusal for a quarantined document: HTTP 422 — the request is
 * well-formed; the ENTITY is unprocessable, and monitoring must not
 * count these as server faults.
 */
export class DocumentQuarantinedError extends Error {
  readonly code = 'DocumentQuarantined';
  constructor(
    readonly baseSha: string,
    readonly expiresAt: number,
  ) {
    super(
      `this document repeatedly crashed the rendering engine and is quarantined until ` +
        `${new Date(expiresAt).toISOString()}`,
    );
  }
}

export interface CrashJournalOptions {
  db: Kysely<Schema>;
  /**
   * Observe-only by default: decisions are computed and PERSISTED (so
   * staging data validates attribution), but `assertNotQuarantined`
   * refuses nothing until enforcement is switched on.
   */
  enforce?: boolean;
  /** Strike/quarantine TTL (default 24h). */
  ttlMs?: number;
  now?: () => number;
  log?: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Env → quarantine config, with the failure modes an operator must hear
 * about at BOOT, not discover in an incident: a TTL that parses to
 * NaN/zero/negative/infinite is a config error, and enforcement without
 * host isolation would be silently inert — both throw (the CLI turns
 * that into exit 2). TTL tuning without enforcement under inline
 * isolation is merely pointless, so it warns.
 */
export function resolveQuarantineConfig(
  env: NodeJS.ProcessEnv,
  engineIsolation: 'inline' | 'host',
): { options?: { enforce: boolean; ttlHours?: number }; warnings: string[] } {
  const enforce = env['CLOUDPDF_QUARANTINE_ENFORCE'] === '1';
  const ttlRaw = env['CLOUDPDF_QUARANTINE_TTL_HOURS'];
  const warnings: string[] = [];

  let ttlHours: number | undefined;
  if (ttlRaw !== undefined && ttlRaw !== '') {
    ttlHours = Number(ttlRaw);
    if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
      throw new Error(
        `CLOUDPDF_QUARANTINE_TTL_HOURS must be a positive finite number of hours (got ${ttlRaw})`,
      );
    }
  }

  if (engineIsolation !== 'host') {
    if (enforce) {
      throw new Error(
        'CLOUDPDF_QUARANTINE_ENFORCE=1 requires CLOUDPDF_ENGINE_ISOLATION=host — the crash ' +
          'journal only exists in host mode, so enforcement would be silently inert',
      );
    }
    if (ttlHours !== undefined) {
      warnings.push(
        'CLOUDPDF_QUARANTINE_TTL_HOURS has no effect without CLOUDPDF_ENGINE_ISOLATION=host',
      );
    }
    return { warnings };
  }

  if (!enforce && ttlHours === undefined) return { warnings };
  return { options: { enforce, ...(ttlHours !== undefined ? { ttlHours } : {}) }, warnings };
}

interface CohortMemory {
  crashId: string;
  at: number;
  build: string;
  exitSig: string;
  shas: Set<string>;
  /** True iff the cohort had exactly one distinct sha. */
  sole: boolean;
}

const MEMORY_COHORTS = 16;

/**
 * Every engine-host death is recorded with
 * its attributable suspects (raw wire kinds — full forensic detail, no
 * taxonomy to maintain); quarantine happens ONLY on two independent
 * sole-suspect crashes sharing `(base_sha, engine_build,
 * exit-signature)` inside the TTL window. The op deliberately does NOT
 * key the pairing: a suspect's op is by definition whatever it was
 * running when the engine died, so op-equality only blocks pairs where
 * the same document was sole-in-flight twice doing different things —
 * a case where the document is overwhelmingly implicated anyway. The
 * exit signature does the incident-typing.
 *
 * Write ordering is load-bearing (review round 2): the crash + suspect
 * rows are inserted in ONE transaction FIRST, and the prior-evidence
 * read happens AFTER that commit — so of two replicas crashing
 * simultaneously, whichever reads last sees the other's row and the
 * pair converges in every interleaving (the quarantine upsert is
 * idempotent when both see each other). Read-before-insert let
 * simultaneous crashes miss each other forever.
 *
 * Ambiguous cohorts are journal-only, with pairwise singleton-
 * intersection candidates stored as operator diagnostics — evidence,
 * never verdicts (the A/B/C counterexample is the regression test).
 * A small in-memory cohort ring keeps attribution correct against a
 * slow database, and journal failures never block engine respawn.
 */
export class CrashJournal {
  private readonly db: Kysely<Schema>;
  private readonly enforce: boolean;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly log: NonNullable<CrashJournalOptions['log']>;
  private readonly memory: CohortMemory[] = [];

  constructor(opts: CrashJournalOptions) {
    this.db = opts.db;
    this.enforce = opts.enforce ?? false;
    this.ttlMs = opts.ttlMs ?? 24 * 60 * 60 * 1_000;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => undefined);
  }

  get enforcing(): boolean {
    return this.enforce;
  }

  /** Never throws; called between in-flight rejection and respawn. */
  async recordCrash(evt: HostCrashEvent): Promise<void> {
    try {
      await this.recordCrashInner(evt);
    } catch (err) {
      this.log('error', 'crash journal write failed (respawn is unaffected)', {
        err: String(err),
      });
    }
  }

  private async recordCrashInner(evt: HostCrashEvent): Promise<void> {
    const at = this.now();
    const build = evt.engineBuild ?? 'unknown';
    const exitSig = `${evt.code ?? 'null'}:${evt.signal ?? 'null'}`;
    const crashId = randomUUID();

    // Attributable suspects, deduped per (sha, raw kind).
    const byKey = new Map<string, { baseSha: string; opKind: string; docId: string | null }>();
    for (const s of evt.suspects) {
      if (s.baseSha === null) continue;
      byKey.set(`${s.baseSha}|${s.opKind}`, {
        baseSha: s.baseSha,
        opKind: s.opKind,
        docId: s.docId,
      });
    }
    const suspects = [...byKey.values()];
    const shas = new Set(suspects.map((s) => s.baseSha));
    const sole = shas.size === 1;

    // 1. INSERT FIRST, atomically — our evidence must be visible to a
    //    concurrent replica's read before we do our own read.
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('engine_crashes')
        .values({
          id: crashId,
          at,
          exit_code: evt.code,
          exit_signal: evt.signal,
          engine_build: build,
          suspect_count: suspects.length,
          likely_candidates: null,
        })
        .execute();
      if (suspects.length > 0) {
        await trx
          .insertInto('engine_crash_suspects')
          .values(
            suspects.map((s) => ({
              crash_id: crashId,
              base_sha: s.baseSha,
              op_kind: s.opKind,
              doc_id: s.docId,
            })),
          )
          .execute();
      }
    });
    this.memory.unshift({ crashId, at, build, exitSig, shas, sole });
    if (this.memory.length > MEMORY_COHORTS) this.memory.length = MEMORY_COHORTS;

    // 2. THEN read prior evidence.
    const priors = await this.recentCohorts(build, at - this.ttlMs, crashId);

    // Diagnostics only: pairwise singleton intersections against prior
    // cohorts. Stored, surfaced, and granted zero enforcement power.
    const candidates = new Set<string>();
    for (const prior of priors) {
      const common = [...shas].filter((sha) => prior.shas.has(sha));
      if (common.length === 1) candidates.add(common[0]!);
    }
    if (candidates.size > 0) {
      await this.db
        .updateTable('engine_crashes')
        .set({ likely_candidates: JSON.stringify([...candidates]) })
        .where('id', '=', crashId)
        .execute();
    }

    // 3. The decision rule: two INDEPENDENT sole-suspect crashes sharing
    //    (sha, build, exit signature) inside the TTL. Idempotent upsert —
    //    simultaneous replicas that both see each other both land here.
    let quarantined = false;
    if (sole) {
      const sha0 = [...shas][0]!;
      const prior = priors.find((p) => p.sole && p.exitSig === exitSig && p.shas.has(sha0));
      if (prior) {
        const expiresAt = at + this.ttlMs;
        await this.db
          .insertInto('engine_quarantine')
          .values({
            base_sha: sha0,
            engine_build: build,
            reason: 'sole-suspect',
            quarantined_at: at,
            expires_at: expiresAt,
            sole_suspect_crash_ids: JSON.stringify([prior.crashId, crashId]),
          })
          .onConflict((oc) =>
            oc.columns(['base_sha', 'engine_build']).doUpdateSet({
              quarantined_at: at,
              expires_at: expiresAt,
              sole_suspect_crash_ids: JSON.stringify([prior.crashId, crashId]),
            }),
          )
          .execute();
        quarantined = true;
        this.log(
          this.enforce ? 'warn' : 'info',
          this.enforce
            ? 'document quarantined after two sole-suspect engine crashes'
            : 'OBSERVE-ONLY: document would be quarantined (two sole-suspect crashes)',
          {
            baseSha: sha0,
            engineBuild: build,
            crashIds: [prior.crashId, crashId],
          },
        );
      }
    }
    if (!quarantined && shas.size > 1) {
      this.log('info', 'engine crash with ambiguous attribution; journaled, no quarantine', {
        crashId,
        suspectShas: [...shas],
        likelyCandidates: [...candidates],
      });
    }

    // 4. Opportunistic retention: crash history past 2×TTL and
    //    quarantine rows expired more than a TTL ago are noise. Tiny
    //    tables, piggybacked here so no sweeper timer exists.
    await this.prune(at).catch(() => undefined);
  }

  private async prune(now: number): Promise<void> {
    const crashCutoff = now - 2 * this.ttlMs;
    const staleCrashes = await this.db
      .selectFrom('engine_crashes')
      .select('id')
      .where('at', '<', crashCutoff)
      .execute();
    if (staleCrashes.length > 0) {
      const ids = staleCrashes.map((c) => c.id);
      // Children first: sqlite foreign_keys enforcement is driver-config
      // dependent, so never rely on ON DELETE CASCADE.
      await this.db.deleteFrom('engine_crash_suspects').where('crash_id', 'in', ids).execute();
      await this.db.deleteFrom('engine_crashes').where('id', 'in', ids).execute();
    }
    await this.db
      .deleteFrom('engine_quarantine')
      .where('expires_at', '<', now - this.ttlMs)
      .execute();
  }

  /** Memory ∪ DB cohorts for `build` since `sinceMs` (excluding `excludeId`). */
  private async recentCohorts(
    build: string,
    sinceMs: number,
    excludeId: string,
  ): Promise<CohortMemory[]> {
    const fromMemory = this.memory.filter(
      (c) => c.build === build && c.at >= sinceMs && c.crashId !== excludeId,
    );
    let fromDb: CohortMemory[] = [];
    try {
      const crashes = await this.db
        .selectFrom('engine_crashes')
        .select(['id', 'at', 'engine_build', 'exit_code', 'exit_signal'])
        .where('engine_build', '=', build)
        .where('at', '>=', sinceMs)
        .where('id', '!=', excludeId)
        .orderBy('at', 'desc')
        .limit(50)
        .execute();
      if (crashes.length > 0) {
        const suspects = await this.db
          .selectFrom('engine_crash_suspects')
          .select(['crash_id', 'base_sha'])
          .where(
            'crash_id',
            'in',
            crashes.map((c) => c.id),
          )
          .execute();
        fromDb = crashes.map((c) => {
          const shaSet = new Set(
            suspects.filter((s) => s.crash_id === c.id).map((s) => s.base_sha),
          );
          return {
            crashId: c.id,
            at: c.at,
            build: c.engine_build,
            exitSig: `${c.exit_code ?? 'null'}:${c.exit_signal ?? 'null'}`,
            shas: shaSet,
            sole: shaSet.size === 1,
          };
        });
      }
    } catch (err) {
      // DB slow/unreachable: the in-memory ring still attributes
      // back-to-back crashes correctly.
      this.log('warn', 'crash journal read failed; using in-memory cohorts only', {
        err: String(err),
      });
    }
    const seen = new Set(fromMemory.map((c) => c.crashId));
    return [...fromMemory, ...fromDb.filter((c) => !seen.has(c.crashId))];
  }

  /**
   * The enforcement gate (QuarantiningEnginePool). Observe-only mode
   * refuses nothing. Enforcement queries the table DIRECTLY — one
   * indexed PK lookup, noise next to any engine operation, and (unlike
   * the earlier 5s cache) immediately authoritative ACROSS replicas: a
   * quarantine written by replica A refuses on replica B on its very
   * next check. `activeBuild` narrows to the running binary — a
   * quarantine for a build this engine no longer runs must not block
   * (the clean-slate law); `null` (host not ready yet) refuses nothing.
   */
  async assertNotQuarantined(baseSha: string, activeBuild: string | null): Promise<void> {
    if (!this.enforce || activeBuild === null) return;
    const now = this.now();
    const hit = await this.db
      .selectFrom('engine_quarantine')
      .select('expires_at')
      .where('base_sha', '=', baseSha)
      .where('engine_build', '=', activeBuild)
      .where('expires_at', '>', now)
      .executeTakeFirst();
    if (hit) throw new DocumentQuarantinedError(baseSha, hit.expires_at);
  }

  async listQuarantine(): Promise<
    Array<{ base_sha: string; engine_build: string; reason: string; expires_at: number }>
  > {
    return this.db
      .selectFrom('engine_quarantine')
      .select(['base_sha', 'engine_build', 'reason', 'expires_at'])
      .orderBy('quarantined_at', 'desc')
      .execute();
  }

  /** Active (unexpired) quarantine count — the metrics gauge's source. */
  async activeQuarantineCount(): Promise<number> {
    const rows = await this.db
      .selectFrom('engine_quarantine')
      .select('base_sha')
      .where('expires_at', '>', this.now())
      .execute();
    return rows.length;
  }

  /**
   * Operator clear: removes the rows and writes the audit trail — ONE
   * transaction, so a cleared quarantine can never exist without its
   * audit row.
   */
  async clear(baseSha: string, input: { actor: string; reason: string }): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      const deleted = await trx
        .deleteFrom('engine_quarantine')
        .where('base_sha', '=', baseSha)
        .executeTakeFirst();
      await trx
        .insertInto('engine_quarantine_audit')
        .values({
          id: randomUUID(),
          cleared_at: this.now(),
          base_sha: baseSha,
          engine_build: null,
          actor: input.actor,
          reason: input.reason,
        })
        .execute();
      return Number(deleted.numDeletedRows ?? 0);
    });
  }
}

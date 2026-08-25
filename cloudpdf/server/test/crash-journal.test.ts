import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { wirePack, type WorkerRequest } from '@embedpdf/engine-core/runtime';
import type { Kysely } from 'kysely';
import { createSqliteDb, migrate, sqliteMigrations, type DbSchema } from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';
import {
  buildHostFixture,
  listAnnotations,
  seedDocument,
  tearDownHostFixture,
} from './_helpers/host-app-fixture';
import {
  CrashJournal,
  DocumentQuarantinedError,
  resolveQuarantineConfig,
} from '../src/services/CrashJournal';

/**
 * The quarantine decision rules (WS3 Phase A §5.2). The load-bearing
 * negative tests come straight from the design review: singleton
 * cohort-intersection is DIAGNOSTICS ONLY (the A/B/C counterexample
 * must never quarantine innocent B), and one sole-suspect crash proves
 * nothing — two independent events on the full key are required.
 */

const BUILD = '3.0.0:linux-x64';

async function makeDb(): Promise<Kysely<DbSchema>> {
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  return db;
}

interface CrashInput {
  shas: string[];
  opKind?: string;
  code?: number | null;
  signal?: string | null;
  build?: string;
}

function crashEvent(input: CrashInput) {
  return {
    suspects: input.shas.map((sha) => ({
      baseSha: sha,
      docId: `doc-${sha}`,
      opKind: input.opKind ?? 'pages.render',
    })),
    code: input.code === undefined ? 70 : input.code,
    signal: input.signal ?? null,
    engineBuild: input.build ?? BUILD,
  };
}

async function quarantineRows(db: Kysely<DbSchema>) {
  return db.selectFrom('engine_quarantine').selectAll().execute();
}

describe('CrashJournal decision rules', () => {
  test('one sole-suspect crash quarantines nothing; two independent ones quarantine', async () => {
    const db = await makeDb();
    const journal = new CrashJournal({ db });
    try {
      await journal.recordCrash(crashEvent({ shas: ['X'] }));
      expect(await quarantineRows(db)).toHaveLength(0);

      await journal.recordCrash(crashEvent({ shas: ['X'] }));
      const rows = await quarantineRows(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.base_sha).toBe('X');
      expect(rows[0]!.reason).toBe('sole-suspect');
      expect(JSON.parse(rows[0]!.sole_suspect_crash_ids!)).toHaveLength(2);

      // Observe-only default: nothing is refused even with the row.
      await expect(journal.assertNotQuarantined('X', BUILD)).resolves.toBeUndefined();
    } finally {
      await db.destroy();
    }
  });

  test('THE A/B/C counterexample: singleton intersection never quarantines innocent B', async () => {
    const db = await makeDb();
    const journal = new CrashJournal({ db });
    try {
      await journal.recordCrash(crashEvent({ shas: ['A', 'B'] })); // caused by A
      await journal.recordCrash(crashEvent({ shas: ['B', 'C'] })); // caused by C
      expect(await quarantineRows(db)).toHaveLength(0); // B stays free, forever

      // …but the intersection IS recorded as operator diagnostics.
      const crashes = await db
        .selectFrom('engine_crashes')
        .selectAll()
        .orderBy('at', 'asc')
        .execute();
      expect(JSON.parse(crashes[1]!.likely_candidates!)).toEqual(['B']);
    } finally {
      await db.destroy();
    }
  });

  test('the hot-innocent example: ambiguous cohorts wait; the poison converges alone', async () => {
    const db = await makeDb();
    const journal = new CrashJournal({ db });
    try {
      await journal.recordCrash(crashEvent({ shas: ['P', 'H'] }));
      await journal.recordCrash(crashEvent({ shas: ['P', 'H'] }));
      expect(await quarantineRows(db)).toHaveLength(0); // repeated membership ≠ evidence

      await journal.recordCrash(crashEvent({ shas: ['P'] })); // sole #1
      expect(await quarantineRows(db)).toHaveLength(0);

      await journal.recordCrash(crashEvent({ shas: ['P'] })); // sole #2 → quarantined
      const rows = await quarantineRows(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.base_sha).toBe('P');
    } finally {
      await db.destroy();
    }
  });

  test('exit signature and build discriminate; the op deliberately does not', async () => {
    const db = await makeDb();
    const journal = new CrashJournal({ db });
    try {
      // Different exit signatures do not pair…
      await journal.recordCrash(crashEvent({ shas: ['X'], code: 70 }));
      await journal.recordCrash(crashEvent({ shas: ['X'], code: null, signal: 'SIGKILL' }));
      expect(await quarantineRows(db)).toHaveLength(0);
      // …different builds do not pair…
      await journal.recordCrash(crashEvent({ shas: ['Z'], build: '3.0.0:linux-x64' }));
      await journal.recordCrash(crashEvent({ shas: ['Z'], build: '3.0.0:linux-arm64' }));
      expect(await quarantineRows(db)).toHaveLength(0);
      // …but DIFFERENT OPS on the same sha+signature DO pair: the same
      // poison bytes reaching the same native fault from two entry
      // points is the same crasher, and the raw kinds are kept as
      // forensics rather than promoted into the key.
      await journal.recordCrash(crashEvent({ shas: ['Y'], opKind: 'pages.render' }));
      await journal.recordCrash(crashEvent({ shas: ['Y'], opKind: 'pages.text' }));
      expect((await quarantineRows(db)).map((r) => r.base_sha)).toEqual(['Y']);
      const kinds = await db
        .selectFrom('engine_crash_suspects')
        .select('op_kind')
        .where('base_sha', '=', 'Y')
        .execute();
      expect(new Set(kinds.map((k) => k.op_kind))).toEqual(
        new Set(['pages.render', 'pages.text']),
      );
      // The X pair with a matching signature still works afterwards.
      await journal.recordCrash(crashEvent({ shas: ['X'], code: 70 }));
      expect((await quarantineRows(db)).map((r) => r.base_sha).sort()).toEqual(['X', 'Y']);
    } finally {
      await db.destroy();
    }
  });

  test('sole-suspect evidence expires with the TTL', async () => {
    const db = await makeDb();
    let clock = 1_000_000;
    const journal = new CrashJournal({ db, ttlMs: 60_000, now: () => clock });
    try {
      await journal.recordCrash(crashEvent({ shas: ['X'] }));
      clock += 61_000; // the first event ages out
      await journal.recordCrash(crashEvent({ shas: ['X'] }));
      expect(await quarantineRows(db)).toHaveLength(0);
      clock += 1_000; // this one pairs with the previous (still fresh)
      await journal.recordCrash(crashEvent({ shas: ['X'] }));
      expect(await quarantineRows(db)).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });

  test('enforcement: 422-shaped refusal, build-narrowed, immediate, clear audits', async () => {
    const db = await makeDb();
    const journal = new CrashJournal({ db, enforce: true });
    try {
      await expect(journal.assertNotQuarantined('X', BUILD)).resolves.toBeUndefined();

      await journal.recordCrash(crashEvent({ shas: ['X'] }));
      await journal.recordCrash(crashEvent({ shas: ['X'] }));

      // Immediate refusal — enforcement queries the table directly.
      await expect(journal.assertNotQuarantined('X', BUILD)).rejects.toThrow(
        DocumentQuarantinedError,
      );
      // A DIFFERENT running binary is not blocked (clean-slate law)…
      await expect(
        journal.assertNotQuarantined('X', '3.0.1:linux-x64'),
      ).resolves.toBeUndefined();
      // …and an unknown build (host not ready) refuses nothing.
      await expect(journal.assertNotQuarantined('X', null)).resolves.toBeUndefined();

      const removed = await journal.clear('X', { actor: 'cli', reason: 'verified fixed' });
      expect(removed).toBe(1);
      await expect(journal.assertNotQuarantined('X', BUILD)).resolves.toBeUndefined();
      const audit = await db.selectFrom('engine_quarantine_audit').selectAll().execute();
      expect(audit).toHaveLength(1);
      expect(audit[0]!.reason).toBe('verified fixed');
    } finally {
      await db.destroy();
    }
  });

  test('unattributable suspects are journaled but can never quarantine', async () => {
    const db = await makeDb();
    const journal = new CrashJournal({ db });
    try {
      const evt = {
        suspects: [{ baseSha: null, docId: 'doc-1', opKind: 'pages.render' }],
        code: 70,
        signal: null,
        engineBuild: BUILD,
      };
      await journal.recordCrash(evt);
      await journal.recordCrash(evt);
      const crashes = await db.selectFrom('engine_crashes').selectAll().execute();
      expect(crashes).toHaveLength(2);
      expect(crashes[0]!.suspect_count).toBe(0);
      expect(await quarantineRows(db)).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });

});

describe('crash journal — round-2 hardening', () => {
  test('cross-replica: a quarantine written by instance A refuses on instance B immediately', async () => {
    const db = await makeDb();
    const a = new CrashJournal({ db });
    const b = new CrashJournal({ db, enforce: true });
    try {
      await a.recordCrash(crashEvent({ shas: ['X'] }));
      await a.recordCrash(crashEvent({ shas: ['X'] }));
      // No cache to go stale: B's very next check hits the table.
      await expect(b.assertNotQuarantined('X', BUILD)).rejects.toThrow(DocumentQuarantinedError);
    } finally {
      await db.destroy();
    }
  });

  test('simultaneous crashes on two replicas converge (insert-first, read-after)', async () => {
    const db = await makeDb();
    const a = new CrashJournal({ db });
    const b = new CrashJournal({ db });
    try {
      // Both record the same sole-suspect at once. With read-before-insert
      // both would see no prior evidence and never pair; insert-then-read
      // guarantees whichever reads last sees the other in EVERY
      // interleaving (and the quarantine upsert is idempotent when both do).
      await Promise.all([
        a.recordCrash(crashEvent({ shas: ['X'] })),
        b.recordCrash(crashEvent({ shas: ['X'] })),
      ]);
      expect((await quarantineRows(db)).map((r) => r.base_sha)).toEqual(['X']);
    } finally {
      await db.destroy();
    }
  });

  test('retention prunes old crash history and long-expired quarantine rows', async () => {
    const db = await makeDb();
    let clock = 1_000_000;
    const journal = new CrashJournal({ db, ttlMs: 60_000, now: () => clock });
    try {
      await journal.recordCrash(crashEvent({ shas: ['OLD'] }));
      clock += 3 * 60_000; // past 2×TTL for the crash row
      await journal.recordCrash(crashEvent({ shas: ['NEW'] }));
      const crashes = await db.selectFrom('engine_crashes').selectAll().execute();
      expect(crashes).toHaveLength(1);
      const suspects = await db.selectFrom('engine_crash_suspects').selectAll().execute();
      expect(suspects.map((s) => s.base_sha)).toEqual(['NEW']);
    } finally {
      await db.destroy();
    }
  });

  test('resolveQuarantineConfig: boot-time validation', () => {
    const host = 'host' as const;
    const inline = 'inline' as const;
    // Valid.
    expect(
      resolveQuarantineConfig({ CLOUDPDF_QUARANTINE_ENFORCE: '1', CLOUDPDF_QUARANTINE_TTL_HOURS: '12' }, host),
    ).toEqual({ options: { enforce: true, ttlHours: 12 }, warnings: [] });
    expect(resolveQuarantineConfig({}, host)).toEqual({ warnings: [] });
    // Invalid TTLs fail loudly.
    for (const bad of ['NaN', '0', '-1', 'Infinity', 'soon']) {
      expect(() =>
        resolveQuarantineConfig({ CLOUDPDF_QUARANTINE_TTL_HOURS: bad }, host),
      ).toThrow(/positive finite/);
    }
    // Enforcement without host isolation would be silently inert → fail.
    expect(() =>
      resolveQuarantineConfig({ CLOUDPDF_QUARANTINE_ENFORCE: '1' }, inline),
    ).toThrow(/requires CLOUDPDF_ENGINE_ISOLATION=host/);
    // TTL-only under inline: pointless, warned, not fatal.
    const warned = resolveQuarantineConfig({ CLOUDPDF_QUARANTINE_TTL_HOURS: '12' }, inline);
    expect(warned.options).toBeUndefined();
    expect(warned.warnings).toHaveLength(1);
  });

  test('the ingestion probe rethrows quarantine refusals but stays best-effort otherwise', async () => {
    const { DocumentSecurityProbe } = await import('../src/services/DocumentSecurityProbe');
    const fakeCache = {
      acquire: async () => ({ path: '/tmp/fake.pdf', release: () => undefined }),
    };
    const quarantinedPool = {
      runAdHoc: async () => {
        throw new DocumentQuarantinedError('sha-q', Date.now() + 1000);
      },
    };
    const flakyPool = {
      runAdHoc: async () => {
        throw new Error('worker exploded');
      },
    };
    const probeQ = new DocumentSecurityProbe({
      cache: fakeCache as never,
      pool: quarantinedPool as never,
    });
    await expect(
      probeQ.probe({ key: 'k', expectedSha: 'sha-q' }),
    ).rejects.toThrow(DocumentQuarantinedError);

    const errors: unknown[] = [];
    const probeF = new DocumentSecurityProbe({
      cache: fakeCache as never,
      pool: flakyPool as never,
      onError: (err) => errors.push(err),
    });
    const result = await probeF.probe({ key: 'k', expectedSha: 'sha-f' });
    expect(result.security.encryptionState).toBe('unknown');
    expect(errors).toHaveLength(1);
  });
});

describe('crash journal end-to-end (host mode, observe-only)', () => {
  const CRASHING_WORKER = fileURLToPath(
    new URL('./_helpers/crashing-worker-entry.cjs', import.meta.url),
  );
  const rawBuild = (payload: Record<string, unknown>) => (jobId: number) =>
    wirePack({ ...payload, jobId } as unknown as WorkerRequest);

  test('two die-jobs journal, quarantine-decide, and (only when enforcing) refuse', async () => {
    const db = await makeDb();
    const bundle = await buildAppForTesting({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: 'crash-journal-secret' },
      workerEntry: CRASHING_WORKER,
      poolSize: 1,
      db,
      engineIsolation: 'host',
      quarantine: { enforce: true },
    });
    try {
      expect(bundle.crashJournal).toBeDefined();
      const pool = bundle.pool!;

      await expect(pool.runAdHoc('sha-poison', rawBuild({ kind: 'die', code: 7 }))).rejects.toThrow(
        /host died|unavailable/i,
      );
      // Wait for respawn, then crash it again on the same sha.
      await new Promise((r) => setTimeout(r, 600));
      await expect(pool.runAdHoc('sha-poison', rawBuild({ kind: 'die', code: 7 }))).rejects.toThrow(
        /host died|unavailable/i,
      );

      // recordCrash is fire-and-forget BY DESIGN (journaling must never
      // delay respawn) — poll for the async writes to land.
      const until = async (fn: () => Promise<boolean>) => {
        const deadline = Date.now() + 10_000;
        while (!(await fn())) {
          if (Date.now() > deadline) throw new Error('journal writes did not land');
          await new Promise((r) => setTimeout(r, 25));
        }
      };
      await until(
        async () => (await db.selectFrom('engine_crashes').selectAll().execute()).length >= 2,
      );
      const crashes = await db.selectFrom('engine_crashes').selectAll().execute();
      expect(crashes[0]!.engine_build).toMatch(/^\d+\.\d+\.\d+.*:/); // version:target
      await until(async () => (await quarantineRows(db)).length === 1);
      const rows = await quarantineRows(db);
      expect(rows.map((r) => r.base_sha)).toEqual(['sha-poison']);

      // Enforcement refuses the sha BEFORE it can crash the fresh host…
      await new Promise((r) => setTimeout(r, 600));
      await expect(pool.runAdHoc('sha-poison', rawBuild({ kind: 'die', code: 7 }))).rejects.toThrow(
        DocumentQuarantinedError,
      );
      // …while other documents flow normally.
      await expect(pool.runAdHoc('sha-ok', rawBuild({ kind: 'anything' }))).resolves.toBeNull();
    } finally {
      await bundle.shutdown();
      await db.destroy();
    }
  }, 60_000);
});

describe('quarantine over HTTP (host fixture, enforcing)', () => {
  test('routes refuse with 422 DocumentQuarantined — including already-resident documents', async () => {
    const fx = await buildHostFixture({ quarantine: { enforce: true } });
    try {
      const sha = await seedDocument(fx, 'tenant-q', 'docq00001');
      const first = await listAnnotations(fx, 'tenant-q', 'docq00001', 'alice');
      expect(first.status).toBe(200); // opened + resident on this replica

      // "Another replica" quarantines the sha for the active build.
      await fx.db
        .insertInto('engine_quarantine')
        .values({
          base_sha: sha,
          engine_build: fx.client.engineBuildId()!,
          reason: 'sole-suspect',
          quarantined_at: Date.now(),
          expires_at: Date.now() + 3_600_000,
          sole_suspect_crash_ids: null,
        })
        .execute();

      // Resident-run gating (round 2, finding 3): the doc is already
      // open here — this call rides run(), which the decorator's
      // residency mirror gates. No cache, no window: immediate 422.
      const second = await listAnnotations(fx, 'tenant-q', 'docq00001', 'alice');
      expect(second.status).toBe(422);
      const body = JSON.parse(second.body) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('DocumentQuarantined');
      expect(body.error.message).toContain('quarantined until');

      // Unrelated documents flow normally.
      await seedDocument(fx, 'tenant-q', 'docq00002');
      const other = await listAnnotations(fx, 'tenant-q', 'docq00002', 'alice');
      expect(other.status).toBe(200);
    } finally {
      await tearDownHostFixture(fx);
    }
  }, 60_000);
});

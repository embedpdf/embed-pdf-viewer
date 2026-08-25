import { describe, expect, test, vi } from 'vitest';
import type { WorkerResultPayload } from '@embedpdf/engine-core/runtime';
import type { EngineHostClient } from '../src/runtime/EngineHostClient';
import type { BuildPack } from '../src/runtime/EnginePool';
import { pickShard, ShardedEnginePool } from '../src/runtime/ShardedEnginePool';
import { createValidTestLicenseGate } from '../src/licensing/testing';
import {
  buildHostFixture,
  createAnnotation,
  listAnnotations,
  seedDocument,
  tearDownHostFixture,
  until,
} from './_helpers/host-app-fixture';

/** ShardedEnginePool: pick, remember, and forget precisely. */

const build: BuildPack = ((jobId: number) => ({
  payload: { kind: 'noop', jobId },
  transfer: [],
})) as unknown as BuildPack;

interface FakeShard {
  client: EngineHostClient;
  calls: string[];
  hooks?: { onEvict: (e: never) => void; onHostRestart: () => void };
}

function fakeShard(overrides: Partial<Record<string, unknown>> = {}): FakeShard {
  const calls: string[] = [];
  const client = {
    runOpen: vi.fn(async (docId: string) => {
      calls.push(`open:${docId}`);
      return { tag: 'open' } as unknown as WorkerResultPayload;
    }),
    run: vi.fn(async (docId: string) => {
      calls.push(`run:${docId}`);
      return { tag: 'ok' } as unknown as WorkerResultPayload;
    }),
    runAdHoc: vi.fn(async () => {
      calls.push('adhoc');
      return { tag: 'ok' } as unknown as WorkerResultPayload;
    }),
    close: vi.fn(async (docId: string) => {
      calls.push(`close:${docId}`);
      return null;
    }),
    destroy: vi.fn(async () => undefined),
    inspect: () => [],
    stats: () => ({ slots: 1, docs: 0, inFlight: 0 }),
    generation: () => 7,
    generationFor: () => 7,
    health: () => ({ state: 'ready' as const, downSinceMs: null }),
    memory: () => ({ rssBytes: 100, heapUsedBytes: 50, ageMs: 5 }),
    recycleStats: () => ({}),
    ...overrides,
  } as unknown as EngineHostClient;
  return { client, calls };
}

async function makeSharded(shards: FakeShard[]): Promise<ShardedEnginePool> {
  return ShardedEnginePool.create({
    count: shards.length,
    spawn: async (i, hooks) => {
      shards[i]!.hooks = hooks as never;
      return shards[i]!.client;
    },
  });
}

describe('rendezvous hash', () => {
  test('distribution: no shard hoards (the FNV-with-suffix failure was 50% on one shard)', () => {
    for (const K of [3, 5]) {
      const counts = new Array(K).fill(0);
      const N = 30_000;
      for (let n = 0; n < N; n++) counts[pickShard(`doc-${n}-${(n * 2654435761) % 997}`, K)]++;
      for (const c of counts) {
        const share = c / N;
        expect(share).toBeGreaterThan((1 / K) * 0.85);
        expect(share).toBeLessThan((1 / K) * 1.15);
      }
    }
  });

  test('remap: K→K+1 moves ≈ 1/(K+1) of keys, and only INTO the new shard', () => {
    const K = 3;
    const N = 20_000;
    let moved = 0;
    for (let n = 0; n < N; n++) {
      const key = `doc-${n}`;
      const before = pickShard(key, K);
      const after = pickShard(key, K + 1);
      if (before !== after) {
        moved++;
        expect(after).toBe(K); // rendezvous only ever moves keys to the newcomer
      }
    }
    expect(moved / N).toBeGreaterThan(0.18);
    expect(moved / N).toBeLessThan(0.32);
  });

  test('deterministic', () => {
    expect(pickShard('doc-x', 4)).toBe(pickShard('doc-x', 4));
  });
});

describe('ShardedEnginePool (fake shards)', () => {
  test('pick + remember: open sticks, run follows, unknown run throws locally', async () => {
    const shards = [fakeShard(), fakeShard(), fakeShard()];
    const pool = await makeSharded(shards);
    await pool.runOpen('doc-a', 'sha-a', build);
    const home = pickShard('doc-a', 3);
    expect(shards[home]!.calls).toContain('open:doc-a');
    await pool.run('doc-a', build);
    expect(shards[home]!.calls).toContain('run:doc-a');
    // Unknown doc: local rejection, NO client dispatched.
    await expect(pool.run('doc-nope', build)).rejects.toMatchObject({ code: 'DocNotOpen' });
    for (const s of shards) expect(s.calls.some((c) => c.includes('doc-nope'))).toBe(false);
    await pool.destroy();
  });

  test('forget precisely: a shard restart scopes ONLY its residents; siblings keep their sticky', async () => {
    const shards = [fakeShard(), fakeShard(), fakeShard()];
    let scopeSeen: ReadonlySet<string> | null = null;
    let shardSeen = -1;
    const pool = await ShardedEnginePool.create({
      count: 3,
      spawn: async (i, hooks) => {
        shards[i]!.hooks = hooks as never;
        return shards[i]!.client;
      },
      onHostRestart: (scope, shard) => {
        scopeSeen = scope.docIds;
        shardSeen = shard;
      },
    });
    // Open docs until two land on DIFFERENT shards.
    const homes = new Map<number, string[]>();
    for (let i = 0; i < 12; i++) {
      const docId = `doc-${i}`;
      await pool.runOpen(docId, `sha-${i}`, build);
      const h = pickShard(docId, 3);
      homes.set(h, [...(homes.get(h) ?? []), docId]);
    }
    const [shardA, docsA] = [...homes.entries()][0]!;
    const other = [...homes.entries()].find(([s]) => s !== shardA)!;

    shards[shardA]!.hooks!.onHostRestart();
    expect(shardSeen).toBe(shardA);
    expect([...scopeSeen!]).toEqual(expect.arrayContaining(docsA));
    expect(scopeSeen!.size).toBe(docsA.length);
    // A-resident: sticky gone → local DocNotOpen. B-resident: untouched.
    await expect(pool.run(docsA[0]!, build)).rejects.toMatchObject({ code: 'DocNotOpen' });
    await pool.run(other[1][0]!, build); // resolves — sibling undisturbed
    await pool.destroy();
  });

  test('generationFor: resident → shard gen; miss → -1; generation() = max', async () => {
    const shards = [fakeShard({ generation: () => 3 }), fakeShard({ generation: () => 9 })];
    const pool = await makeSharded(shards);
    await pool.runOpen('doc-g', 'sha-g', build);
    const home = pickShard('doc-g', 2);
    expect(pool.generationFor('doc-g')).toBe(home === 0 ? 3 : 9);
    expect(pool.generationFor('doc-miss')).toBe(-1);
    expect(pool.generation()).toBe(9);
    await pool.destroy();
  });

  test('health: any shard down wins; downSinceMs aggregates by MAX elapsed', async () => {
    const shards = [
      fakeShard(),
      fakeShard({ health: () => ({ state: 'backoff' as const, downSinceMs: 12_000 }) }),
      fakeShard({ health: () => ({ state: 'starting' as const, downSinceMs: 3_000 }) }),
    ];
    const pool = await makeSharded(shards);
    expect(pool.health()).toEqual({ state: 'backoff', downSinceMs: 12_000 });
    await pool.destroy();
  });

  test('memory: sum only when EVERY shard reports; age is the oldest', async () => {
    const full = await makeSharded([
      fakeShard({ memory: () => ({ rssBytes: 100, heapUsedBytes: 10, ageMs: 2 }) }),
      fakeShard({ memory: () => ({ rssBytes: 250, heapUsedBytes: 20, ageMs: 9 }) }),
    ]);
    expect(full.memory()).toEqual({ rssBytes: 350, heapUsedBytes: 30, ageMs: 9 });
    await full.destroy();
    const holed = await makeSharded([fakeShard(), fakeShard({ memory: () => null })]);
    expect(holed.memory()).toBeNull();
    await holed.destroy();
  });

  test('runAdHoc: sha routes by content; sha-less round-robins skipping non-ready shards', async () => {
    const down = fakeShard({ health: () => ({ state: 'backoff' as const, downSinceMs: 1 }) });
    const shards = [fakeShard(), down, fakeShard()];
    const pool = await makeSharded(shards);
    const home = pickShard('sha-z', 3);
    await pool.runAdHoc('sha-z', build);
    expect(shards[home]!.calls).toContain('adhoc');
    // Sha-less: cycles 0 → 2 → 0 …, never the down shard.
    await pool.runAdHoc(undefined, build);
    await pool.runAdHoc(undefined, build);
    await pool.runAdHoc(undefined, build);
    expect(down.calls.filter((c) => c === 'adhoc')).toHaveLength(home === 1 ? 1 : 0);
    await pool.destroy();
  });

  test('allSettled boot: a late-succeeding sibling is reaped, not orphaned', async () => {
    const born: FakeShard[] = [];
    await expect(
      ShardedEnginePool.create({
        count: 3,
        spawn: async (i) => {
          if (i === 1) throw new Error('shard 1 boot failed');
          // Shard 2 succeeds AFTER the failure has been observed.
          if (i === 2) await new Promise((r) => setTimeout(r, 50));
          const s = fakeShard();
          born.push(s);
          return s.client;
        },
      }),
    ).rejects.toThrow(/shard 1 boot failed/);
    expect(born).toHaveLength(2);
    for (const s of born) expect(s.client.destroy).toHaveBeenCalled();
  });

  test('buildApp rejects a shard count the worker total cannot divide — before anything boots', async () => {
    // Raw buildApp, NOT buildAppForTesting: the test helper deliberately
    // rounds poolSize up for the CLOUDPDF_TEST_SHARDS matrix leg, which
    // would mask exactly this validation.
    const { buildApp } = await import('../src/index');
    await expect(
      buildApp({
        licenseGate: createValidTestLicenseGate(),
        verifier: { mode: 'hs256', secret: 's' },
        workerEntry: new URL('./_helpers/stub-worker-entry.cjs', import.meta.url),
        engineIsolation: 'host',
        engineHostEntry: new URL('../src/runtime/engine-host-entry.ts', import.meta.url),
        engineShards: 3,
        poolSize: 2,
      }),
    ).rejects.toThrow(/divide evenly/);
    await expect(
      buildApp({
        licenseGate: createValidTestLicenseGate(),
        verifier: { mode: 'hs256', secret: 's' },
        workerEntry: new URL('./_helpers/stub-worker-entry.cjs', import.meta.url),
        engineIsolation: 'inline',
        engineShards: 2,
      }),
    ).rejects.toThrow(/requires engineIsolation 'host'/);
  });
});

describe('sharded fixture (host, K=2) — blast radius for real', () => {
  test('killing shard A truncates only A: B stays warm (no reopen storm), journal sees one crash, A reopens clean', async () => {
    const fx = await buildHostFixture({ shards: 2, poolSize: 2 });
    try {
      expect(fx.bundle.engineHosts).toHaveLength(2);
      // Open docs until both shards hold at least one.
      const byShard = new Map<number, string[]>();
      const shaOf = new Map<string, string>();
      for (let i = 0; i < 10 && byShard.size < 2; i++) {
        const docId = `docsh${i}`;
        shaOf.set(docId, await seedDocument(fx, 'tenant-k', docId));
        expect((await listAnnotations(fx, 'tenant-k', docId, 'alice')).status).toBe(200);
        const shard = pickShard(docId, 2);
        byShard.set(shard, [...(byShard.get(shard) ?? []), docId]);
      }
      expect(byShard.size).toBe(2);
      const [shardA, docsA] = [...byShard.entries()][0]!;
      const docA = docsA[0]!;
      const docB = [...byShard.entries()].find(([s]) => s !== shardA)![1][0]!;

      // Park a write on shard A, then kill A's child.
      const stalled = createAnnotation(fx, 'tenant-k', docA, 'alice', '__STALL__');
      const clientA = fx.bundle.engineHosts![shardA]!;
      await until(() => clientA.stats().inFlight >= 1);
      const opensBefore = fx.bundle.engineCounters!.docOpens;
      process.kill(clientA.hostPid()!, 'SIGKILL');
      const stalledRes = await stalled;
      expect(stalledRes.status).toBeGreaterThanOrEqual(500);

      // THE assertion: B is undisturbed AND warm — no reopen storm.
      expect((await listAnnotations(fx, 'tenant-k', docB, 'alice')).status).toBe(200);
      expect(fx.bundle.engineCounters!.docOpens).toBe(opensBefore);

      // A's residents cold-reopen cleanly on the respawned shard.
      await until(() => clientA.health().state === 'ready', 10_000);
      expect((await listAnnotations(fx, 'tenant-k', docA, 'alice')).status).toBe(200);
      expect(fx.bundle.engineCounters!.docOpens).toBeGreaterThan(opensBefore);

      // Journal: exactly one crash — persistence is fire-and-forget by
      // design, so poll the DATABASE CONDITION itself (review round:
      // `until(() => true)` was a no-op that made this assertion a race).
      const crashCount = async (): Promise<number> => {
        const row = await fx.db
          .selectFrom('engine_crashes')
          .select(fx.db.fn.countAll().as('n'))
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      };
      const deadline = Date.now() + 10_000;
      while ((await crashCount()) < 1) {
        if (Date.now() > deadline) throw new Error('journal row never appeared');
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(await crashCount()).toBe(1);
      // And the suspect is shard A's stalled write — attribution follows
      // the shard boundary.
      const suspects = await fx.db.selectFrom('engine_crash_suspects').select('base_sha').execute();
      expect(suspects.map((s) => s.base_sha)).toContain(shaOf.get(docA)!);
    } finally {
      await tearDownHostFixture(fx);
    }
  }, 90_000);

  test('killing EVERY shard forgets everything — scoped forget composes to the full clear', async () => {
    const fx = await buildHostFixture({ shards: 2, poolSize: 2 });
    try {
      await seedDocument(fx, 'tenant-k', 'doceq1');
      await seedDocument(fx, 'tenant-k', 'doceq2');
      expect((await listAnnotations(fx, 'tenant-k', 'doceq1', 'alice')).status).toBe(200);
      expect((await listAnnotations(fx, 'tenant-k', 'doceq2', 'alice')).status).toBe(200);
      const warm = fx.bundle.engineCounters!.docOpens;
      // Warmth check: repeats do not reopen.
      expect((await listAnnotations(fx, 'tenant-k', 'doceq1', 'alice')).status).toBe(200);
      expect(fx.bundle.engineCounters!.docOpens).toBe(warm);

      // Kill BOTH shards: two scoped forgets must compose to "everything
      // forgotten" — every doc cold-reopens, none is missed. Fence on the
      // GENERATION bump: SIGKILL delivery and the exit event are async, so
      // "still ready" right after the kill is the un-reaped corpse — wait
      // for each successor (gen > before) to be ready.
      const gensBefore = fx.bundle.engineHosts!.map((h) => h.generation());
      for (const h of fx.bundle.engineHosts!) process.kill(h.hostPid()!, 'SIGKILL');
      await until(
        () =>
          fx.bundle.engineHosts!.every(
            (h, i) => h.generation() > gensBefore[i]! && h.health().state === 'ready',
          ),
        15_000,
      );
      expect((await listAnnotations(fx, 'tenant-k', 'doceq1', 'alice')).status).toBe(200);
      expect((await listAnnotations(fx, 'tenant-k', 'doceq2', 'alice')).status).toBe(200);
      expect(fx.bundle.engineCounters!.docOpens).toBeGreaterThan(warm);
    } finally {
      await tearDownHostFixture(fx);
    }
  }, 90_000);
});

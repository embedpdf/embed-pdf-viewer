import { describe, expect, test, vi } from 'vitest';
import type { CgroupMemory } from '../src/runtime/cgroup-memory';
import type { EngineHostClient } from '../src/runtime/EngineHostClient';
import { EngineRecycler, resolveRecycleConfig } from '../src/runtime/EngineRecycler';
import {
  buildHostFixture,
  createAnnotation,
  listAnnotations,
  seedDocument,
  tearDownHostFixture,
  until,
} from './_helpers/host-app-fixture';

/** C2 — recycle policy (the mechanism is covered in the lifecycle suite). */

function fakeHost(rss: number | null, uptimeMs: number | null = 60_000): EngineHostClient {
  return {
    memory: () => (rss === null ? null : { rssBytes: rss, heapUsedBytes: rss / 2, ageMs: 100 }),
    uptimeMs: () => uptimeMs,
    recycle: vi.fn(async () => true),
  } as unknown as EngineHostClient;
}

const cg =
  (workingSetBytes: number, limitBytes: number | null): (() => CgroupMemory | null) =>
  () => ({ workingSetBytes, limitBytes });

describe('EngineRecycler policy', () => {
  test('soft watermark recycles the LARGEST host gracefully; below the mark does nothing', async () => {
    const small = fakeHost(100e6);
    const big = fakeHost(400e6);
    const r = new EngineRecycler(() => [small, big], cg(750e6, 1000e6), {});
    const d = await r.tick();
    expect(d).toEqual({ reason: 'soft-rss', graceful: true });
    expect(big.recycle).toHaveBeenCalledWith(
      'soft-rss',
      expect.objectContaining({ graceful: true }),
    );
    expect(small.recycle).not.toHaveBeenCalled();

    const idle = new EngineRecycler(() => [small], cg(300e6, 1000e6), {});
    expect(await idle.tick()).toBeNull();
  });

  test('hard watermark cuts immediately (graceful: false)', async () => {
    const host = fakeHost(500e6);
    const r = new EngineRecycler(() => [host], cg(900e6, 1000e6), {});
    const d = await r.tick();
    expect(d).toEqual({ reason: 'hard-rss', graceful: false });
    expect(host.recycle).toHaveBeenCalledWith(
      'hard-rss',
      expect.objectContaining({ graceful: false }),
    );
  });

  test('cooldown spaces recycles; a refused recycle does NOT consume the cooldown', async () => {
    const host = fakeHost(500e6);
    const r = new EngineRecycler(() => [host], cg(750e6, 1000e6), { cooldownMs: 60_000 });
    expect(await r.tick(1_000_000)).not.toBeNull();
    expect(await r.tick(1_030_000)).toBeNull(); // inside cooldown
    expect(await r.tick(1_061_000)).not.toBeNull(); // past it

    const refusing = {
      ...fakeHost(500e6),
      recycle: vi.fn(async () => false), // host mid-respawn
    } as unknown as EngineHostClient;
    const r2 = new EngineRecycler(() => [refusing], cg(750e6, 1000e6), { cooldownMs: 60_000 });
    expect(await r2.tick(1_000_000)).toBeNull();
    expect(await r2.tick(1_001_000)).toBeNull(); // retries immediately, not blocked by cooldown
    expect(refusing.recycle).toHaveBeenCalledTimes(2);
  });

  test('no heartbeat = no victim; explicit per-host RSS limit is a secondary guard', async () => {
    const silent = fakeHost(null);
    const r = new EngineRecycler(() => [silent], cg(900e6, 1000e6), {});
    expect(await r.tick()).toBeNull(); // cannot attribute → no recycle

    const host = fakeHost(600e6);
    const rssGuard = new EngineRecycler(
      () => [host],
      () => null,
      { maxRssBytes: 500e6 },
    );
    const d = await rssGuard.tick();
    expect(d).toEqual({ reason: 'soft-rss', graceful: true });
  });

  test('jittered lifetime recycling fires at uptime ≥ max × factor', async () => {
    const young = fakeHost(10e6, 1_000_000);
    const old = fakeHost(10e6, 7_300_000);
    const r = new EngineRecycler(
      () => [young, old],
      () => null,
      {
        maxLifetimeMs: 7_200_000,
        jitter: () => 0.5, // factor exactly 1.0
      },
    );
    const d = await r.tick();
    expect(d).toEqual({ reason: 'lifetime', graceful: true });
    expect(old.recycle).toHaveBeenCalled();
    expect(young.recycle).not.toHaveBeenCalled();
  });
});

describe('resolveRecycleConfig', () => {
  const cgNone = (): CgroupMemory | null => null;
  const cgLimited = (): CgroupMemory | null => ({ workingSetBytes: 1, limitBytes: 1000e6 });

  test('absent env = disabled; explicit 0 = disabled even with knobs', () => {
    expect(resolveRecycleConfig({}, 'host', cgLimited).enabled).toBe(false);
    expect(
      resolveRecycleConfig(
        { CLOUDPDF_ENGINE_RECYCLE: '0', CLOUDPDF_ENGINE_MAX_RSS_MB: '512' },
        'host',
        cgLimited,
      ).enabled,
    ).toBe(false);
  });

  test('a knob alone enables; values map to the policy', () => {
    const c = resolveRecycleConfig(
      {
        CLOUDPDF_ENGINE_MAX_RSS_MB: '512',
        CLOUDPDF_ENGINE_MAX_LIFETIME_HOURS: '24',
        CLOUDPDF_ENGINE_RECYCLE_SOFT_PCT: '60',
        CLOUDPDF_ENGINE_RECYCLE_HARD_PCT: '80',
      },
      'host',
      cgLimited,
    );
    expect(c.enabled).toBe(true);
    expect(c.policy).toEqual({
      softPct: 60,
      hardPct: 80,
      maxRssBytes: 512 * 1024 * 1024,
      maxLifetimeMs: 24 * 3_600_000,
    });
  });

  test('enabled under inline isolation fails boot', () => {
    expect(() =>
      resolveRecycleConfig({ CLOUDPDF_ENGINE_RECYCLE: '1' }, 'inline', cgLimited),
    ).toThrow(/host/);
  });

  test('enabled with NO pressure source fails boot; lifetime-only without cgroup warns', () => {
    expect(() => resolveRecycleConfig({ CLOUDPDF_ENGINE_RECYCLE: '1' }, 'host', cgNone)).toThrow(
      /pressure source/,
    );
    const c = resolveRecycleConfig(
      { CLOUDPDF_ENGINE_RECYCLE: '1', CLOUDPDF_ENGINE_MAX_LIFETIME_HOURS: '12' },
      'host',
      cgNone,
    );
    expect(c.enabled).toBe(true);
    expect(c.warnings.some((w) => w.includes('watermark recycling is inert'))).toBe(true);
  });

  test('CLOUDPDF_ENGINE_MAX_RSS_MB=0 fails boot (zero-byte threshold would recycle every cooldown)', () => {
    expect(() =>
      resolveRecycleConfig({ CLOUDPDF_ENGINE_MAX_RSS_MB: '0' }, 'host', cgLimited),
    ).toThrow(/greater than zero/);
  });

  test('an unknown master value fails boot instead of silently disabling', () => {
    expect(() =>
      resolveRecycleConfig({ CLOUDPDF_ENGINE_RECYCLE: 'treu' }, 'host', cgLimited),
    ).toThrow(/must be 1\/true\/0\/false/);
  });

  test('bad percentages and inverted watermarks fail boot', () => {
    for (const bad of ['0', '100', '-5', 'soon']) {
      expect(() =>
        resolveRecycleConfig(
          { CLOUDPDF_ENGINE_RECYCLE: '1', CLOUDPDF_ENGINE_RECYCLE_SOFT_PCT: bad },
          'host',
          cgLimited,
        ),
      ).toThrow(/percentage/);
    }
    expect(() =>
      resolveRecycleConfig(
        {
          CLOUDPDF_ENGINE_RECYCLE: '1',
          CLOUDPDF_ENGINE_RECYCLE_SOFT_PCT: '85',
          CLOUDPDF_ENGINE_RECYCLE_HARD_PCT: '70',
        },
        'host',
        cgLimited,
      ),
    ).toThrow(/below/);
  });
});

describe('recycle through the full app (host fixture)', () => {
  test('truncated write at recycle: clean rejection, NO journal strike, retry succeeds; parked reads see zero 5xx', async () => {
    const fx = await buildHostFixture();
    try {
      await seedDocument(fx, 'tenant-r', 'docrec001');
      await seedDocument(fx, 'tenant-r', 'docrec002');
      expect((await listAnnotations(fx, 'tenant-r', 'docrec001', 'alice')).status).toBe(200);
      expect((await listAnnotations(fx, 'tenant-r', 'docrec002', 'alice')).status).toBe(200);

      // A write parked in the engine (never replies) — the recycle's
      // settle window expires and truncates it: the crash-window shape.
      const stalled = createAnnotation(fx, 'tenant-r', 'docrec001', 'alice', '__STALL__');
      await until(() => fx.client.stats().inFlight >= 1);

      // Reads issued DURING the graceful recycle park and complete on
      // the successor — the zero-5xx property for settled-or-parked work.
      const recycled = fx.client.recycle('manual', { settleWindowMs: 250 });
      const during = listAnnotations(fx, 'tenant-r', 'docrec002', 'alice');

      expect(await recycled).toBe(true);
      const stalledRes = await stalled;
      expect(stalledRes.status).toBeGreaterThanOrEqual(500); // truncated, honestly
      expect((await during).status).toBe(200);

      // A rehearsed crash leaves NO journal evidence.
      const crashes = await fx.db
        .selectFrom('engine_crashes')
        .select(fx.db.fn.countAll().as('n'))
        .executeTakeFirst();
      expect(Number(crashes?.n ?? 0)).toBe(0);
      expect(fx.client.recycleStats().manual).toBe(1);

      // The write retries cleanly against the successor.
      const retry = await createAnnotation(fx, 'tenant-r', 'docrec001', 'alice', 'after-recycle');
      expect(retry.status).toBeLessThan(300);
      expect((await listAnnotations(fx, 'tenant-r', 'docrec001', 'alice')).status).toBe(200);
    } finally {
      await tearDownHostFixture(fx);
    }
  }, 60_000);
});

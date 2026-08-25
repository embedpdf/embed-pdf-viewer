import { describe, expect, test } from 'vitest';
import type { BuildPack, EnginePool, RunAdHocOptions } from '../src/runtime/EnginePool';
import { EngineBusyError, SchedulingEnginePool } from '../src/runtime/SchedulingEnginePool';
import { DerivedRenderService } from '../src/services/DerivedRenderService';
import type { WorkerResultPayload } from '@embedpdf/engine-core/runtime';
import {
  buildHostFixture,
  createAnnotation,
  docToken,
  listAnnotations,
  seedDocument,
  tearDownHostFixture,
  until,
} from './_helpers/host-app-fixture';

/** C1 — lanes, bounded queues, shed semantics. */

interface Job {
  resolve: (r: WorkerResultPayload) => void;
  reject: (e: unknown) => void;
  lane: string;
}

/** Inner pool whose jobs settle only when the test says so. */
function fakeInner(slots = 2): { pool: EnginePool; jobs: Job[] } {
  const jobs: Job[] = [];
  const dispatch = (lane: string): Promise<WorkerResultPayload> =>
    new Promise((resolve, reject) => {
      jobs.push({ resolve, reject, lane });
    });
  const pool: EnginePool = {
    runOpen: (() => dispatch('open')) as EnginePool['runOpen'],
    run: () => dispatch('run'),
    runAdHoc: (_sha: string | undefined, _b: BuildPack, _s?: AbortSignal, opts?: RunAdHocOptions) =>
      dispatch(opts?.lane ?? 'interactive'),
    close: async () => null,
    destroy: async () => undefined,
    inspect: () => [],
    stats: () => ({ slots, docs: 0, inFlight: 0 }),
    generation: () => 0,
    health: () => ({ state: 'ready', downSinceMs: null }),
  };
  return { pool, jobs };
}

const build: BuildPack = ((jobId: number) => ({
  payload: { kind: 'noop', jobId },
  transfer: [],
})) as unknown as BuildPack;

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('SchedulingEnginePool', () => {
  test('background is capped while interactive may use every slot', async () => {
    const { pool: inner, jobs } = fakeInner(4); // maxInFlight 8, bg cap 2
    const pool = new SchedulingEnginePool(inner);
    const settled: string[] = [];
    for (let i = 0; i < 5; i++) {
      void pool
        .runAdHoc('sha', build, undefined, { lane: 'background' })
        .then(() => settled.push(`bg${i}`));
    }
    await tick();
    // Only the background cap dispatches; the rest queue.
    expect(jobs.length).toBe(2);
    expect(pool.schedulingStats().background).toMatchObject({ inFlight: 2, queueDepth: 3 });

    // Interactive sails past the queued background — up to maxInFlight.
    const runs = Array.from({ length: 6 }, () => pool.run('d', build));
    await tick();
    expect(jobs.length).toBe(8); // 2 bg + 6 interactive dispatched
    expect(pool.schedulingStats().interactive.inFlight).toBe(6);

    // Finishing one background job admits the next background waiter.
    jobs[0]!.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await tick();
    expect(pool.schedulingStats().background).toMatchObject({ inFlight: 2, queueDepth: 2 });
    for (const j of jobs) j.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await Promise.all(runs);
  });

  test('queue overflow sheds immediately with EngineBusyError; sheds are counted', async () => {
    const { pool: inner, jobs } = fakeInner(1);
    const pool = new SchedulingEnginePool(inner, {
      maxInFlight: 1,
      interactiveMaxQueued: 1,
    });
    const first = pool.run('a', build); // occupies the slot
    await tick();
    const queued = pool.run('b', build); // queues
    queued.catch(() => undefined);
    await expect(pool.run('c', build)).rejects.toBeInstanceOf(EngineBusyError);
    expect(pool.schedulingStats().interactive.shedsTotal).toBe(1);
    jobs[0]!.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await tick();
    jobs[1]!.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await Promise.all([first, queued]);
    expect(pool.schedulingStats().interactive.queueWaitCount).toBe(1);
  });

  test('queued jobs shed on their wait deadline', async () => {
    const { pool: inner, jobs } = fakeInner(1);
    const pool = new SchedulingEnginePool(inner, {
      maxInFlight: 1,
      interactiveQueueTimeoutMs: 30,
    });
    const first = pool.run('a', build);
    await tick();
    await expect(pool.run('b', build)).rejects.toBeInstanceOf(EngineBusyError);
    jobs[0]!.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await first;
  });

  test('abort while queued rejects Aborted and frees the queue slot', async () => {
    const { pool: inner, jobs } = fakeInner(1);
    const pool = new SchedulingEnginePool(inner, { maxInFlight: 1 });
    const first = pool.run('a', build);
    await tick();
    const ac = new AbortController();
    const queued = pool.run('b', build, ac.signal);
    await tick();
    ac.abort();
    await expect(queued).rejects.toMatchObject({ code: 'Aborted' });
    expect(pool.schedulingStats().interactive.queueDepth).toBe(0);
    jobs[0]!.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await first;
  });

  test('onQueueWait fires per dispatched job that waited — never for sheds', async () => {
    const { pool: inner, jobs } = fakeInner(1);
    const waits: Array<{ lane: string; ms: number }> = [];
    const pool = new SchedulingEnginePool(inner, {
      maxInFlight: 1,
      interactiveMaxQueued: 1,
      onQueueWait: (lane, ms) => waits.push({ lane, ms }),
    });
    const first = pool.run('a', build);
    await tick();
    const queued = pool.run('b', build);
    await expect(pool.run('c', build)).rejects.toBeInstanceOf(EngineBusyError); // shed
    expect(waits).toHaveLength(0);
    jobs[0]!.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await tick();
    expect(waits).toHaveLength(1);
    expect(waits[0]!.lane).toBe('interactive');
    expect(waits[0]!.ms).toBeGreaterThanOrEqual(0);
    jobs[1]!.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await Promise.all([first, queued]);
  });

  test('backgroundMaxInFlight: 0 is a strict disable — instant shed, interactive untouched', async () => {
    const { pool: inner, jobs } = fakeInner(2);
    const pool = new SchedulingEnginePool(inner, { backgroundMaxInFlight: 0 });
    await expect(
      pool.runAdHoc('sha', build, undefined, { lane: 'background' }),
    ).rejects.toBeInstanceOf(EngineBusyError);
    expect(pool.schedulingStats().background.shedsTotal).toBe(1);
    const run = pool.run('d', build);
    await tick();
    expect(jobs).toHaveLength(1);
    jobs[0]!.resolve({ tag: 'ok' } as unknown as WorkerResultPayload);
    await run;
  });

  test('a shed warm leaves the thumbnail retryable (no failed write)', async () => {
    const thumbnailWrites: string[] = [];
    const warmErrors: unknown[] = [];
    const service = new DerivedRenderService({
      storage: { put: async () => undefined, get: async () => null } as never,
      cache: {
        acquire: async () => ({ path: '/tmp/x.pdf', size: 1, release: () => undefined }),
      } as never,
      pool: {
        runAdHoc: async () => {
          throw new EngineBusyError('background', 'shed');
        },
      } as never,
      encoder: {
        encodeToBuffer: async () => ({ bytes: new Uint8Array(), contentType: 'image/webp' }),
      } as never,
      documents: {
        setThumbnail: async (_d: string, _t: string, state: string) => {
          thumbnailWrites.push(state);
        },
      } as never,
      onWarmError: (err) => warmErrors.push(err),
    });
    await service.warmDocumentThumbnail({
      tenantId: 't',
      docId: 'd',
      baseSha: 'sha',
      baseKey: 'key',
    });
    expect(thumbnailWrites).toEqual([]); // no 'failed' — and no 'ready' either
    expect(warmErrors).toEqual([]); // a shed is not an error
  });
});

describe('overload over HTTP (host fixture, maxInFlight=1)', () => {
  test('a saturated engine sheds with 503 + Retry-After instead of hanging', async () => {
    const fx = await buildHostFixture({
      scheduling: { maxInFlight: 1, interactiveMaxQueued: 0 },
    });
    try {
      await seedDocument(fx, 'tenant-s', 'docsched1');
      await seedDocument(fx, 'tenant-s', 'docsched2');
      // Warm BOTH docs while the slot is free.
      expect((await listAnnotations(fx, 'tenant-s', 'docsched1', 'alice')).status).toBe(200);
      expect((await listAnnotations(fx, 'tenant-s', 'docsched2', 'alice')).status).toBe(200);
      // Park a create in the engine (__STALL__ never replies) — it holds
      // the single admission slot.
      const stalled = createAnnotation(fx, 'tenant-s', 'docsched1', 'alice', '__STALL__');
      await until(() => fx.bundle.engineScheduler!.schedulingStats().interactive.inFlight >= 1);
      // The probe uses a DIFFERENT document: a read of docsched1's own
      // layer would park on the WS1 write marker (the dirty window)
      // before ever reaching admission — correct, but not what this test
      // measures. docsched2 goes straight to the scheduler.
      const shed = await listAnnotations(fx, 'tenant-s', 'docsched2', 'alice');
      expect(shed.status).toBe(503);
      expect(JSON.parse(shed.body).error.code).toBe('EngineBusy');
      const raw = await fetch(
        `${fx.baseUrl}/v1/docs/docsched2/layers/alice/annotations/pages/1/items`,
        { headers: { Authorization: `Bearer ${docToken('tenant-s', 'docsched2', 'alice')}` } },
      );
      expect(raw.status).toBe(503);
      expect(raw.headers.get('retry-after')).toBe('2');
      // Unstick the parked engine call so teardown's app.close() can drain
      // its HTTP request: kill the host — the generation machinery rejects
      // the stalled dispatch (the boundary-kill mechanics).
      process.kill(fx.client.hostPid()!, 'SIGKILL');
      await stalled; // settles (error response) once the dispatch rejects
    } finally {
      await tearDownHostFixture(fx);
    }
  }, 60_000);
});

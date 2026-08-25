import { EventEmitter, getEventListeners } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import { wirePack, type WorkerRequest } from '@embedpdf/engine-core/runtime';
import {
  EngineHostClient,
  type ChildLike,
  type EngineHostClientOptions,
  type HostCrashEvent,
} from '../src/runtime/EngineHostClient';
import { HOST_PROTOCOL_VERSION } from '../src/runtime/host-protocol';

/**
 * The engine-host lifecycle state machine. Test 1 is the review-found
 * bug this design exists to prevent: a dispatch inside the death→respawn
 * gap must reject or complete within its deadline — under the v1 sketch
 * it sailed past a stale resolved `ready`, sent into a dead child whose
 * `exit` had already fired, and hung forever.
 */

class FakeChild extends EventEmitter implements ChildLike {
  pid = 4242;
  readonly sent: Array<Record<string, unknown>> = [];
  readonly kills: string[] = [];
  sendError: Error | null = null;

  send(msg: unknown, callback?: (err: Error | null) => void): boolean {
    this.sent.push(msg as Record<string, unknown>);
    callback?.(this.sendError);
    // Mirror the real host: inspect is always answered (create() primes
    // the mirror with one awaited round-trip).
    const m = msg as { t?: string; callId?: number };
    if (this.sendError === null && m.t === 'inspect') {
      queueMicrotask(() =>
        this.emit('message', {
          t: 'control',
          callId: m.callId,
          control: { tag: 'inspect', slots: [] },
        }),
      );
    }
    return this.sendError === null;
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.kills.push(signal);
    return true;
  }

  ready(engineBuild = 'test-build'): void {
    this.emit('message', {
      t: 'ready',
      protocol: HOST_PROTOCOL_VERSION,
      pid: this.pid,
      engineBuild,
    });
  }

  exit(code: number | null = 139, signal: string | null = null): void {
    this.emit('exit', code, signal);
  }

  result(callId: number, result: unknown = { tag: 'ok' }): void {
    this.emit('message', { t: 'result', callId, result });
  }
}

const build = (jobId: number) => wirePack({ kind: 'noop', jobId } as unknown as WorkerRequest);

function harness(overrides: Partial<EngineHostClientOptions> = {}) {
  const children: FakeChild[] = [];
  const spawnedAt: number[] = [];
  const crashes: HostCrashEvent[] = [];
  const restarts: number[] = [];
  const evictions: Array<{ docId: string; baseSha: string; slot: number }> = [];
  const clientPromise = EngineHostClient.create({
    hostEntry: 'fake-entry.js',
    boot: { workerEntry: 'fake-worker.js', fonts: [] },
    forkImpl: () => {
      const child = new FakeChild();
      children.push(child);
      spawnedAt.push(Date.now());
      return child;
    },
    respawnBaseMs: 5,
    respawnMaxMs: 40,
    shutdownTimeoutMs: 50,
    readyTimeoutMs: 250,
    dispatchDeadlineMs: 300,
    onHostCrash: (evt) => crashes.push(evt),
    onHostRestart: () => restarts.push(Date.now()),
    onEvict: (evt) => evictions.push(evt),
    ...overrides,
  });
  return { clientPromise, children, spawnedAt, crashes, restarts, evictions };
}

function children0Ready(h: ReturnType<typeof harness>): boolean {
  return h.children.length === 1;
}

async function until(fn: () => boolean, ms = 2_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error('until: condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('EngineHostClient lifecycle', () => {
  test('THE gap test: a dispatch during death→respawn never hangs', async () => {
    const { clientPromise, children } = harness();
    children[0]!.ready();
    const client = await clientPromise;

    children[0]!.exit(139); // host dies
    // Immediately dispatch — the respawn (5ms timer) has not run yet and
    // the replacement child will NEVER become ready.
    const started = Date.now();
    await expect(client.run('doc-1', build)).rejects.toThrow(/unavailable|respawn/i);
    expect(Date.now() - started).toBeLessThan(1_500); // bounded, not hung
    await client.destroy();
  });

  test('a dispatch during the gap completes once the respawned host is ready', async () => {
    const { clientPromise, children } = harness();
    children[0]!.ready();
    const client = await clientPromise;
    children[0]!.exit(139);

    const call = client.run('doc-1', build);
    await until(() => children.length === 2);
    children[1]!.ready();
    await until(() => children[1]!.sent.some((m) => m['t'] === 'dispatch'));
    const dispatch = children[1]!.sent.find((m) => m['t'] === 'dispatch')!;
    children[1]!.result(dispatch['callId'] as number, { tag: 'after-respawn' });
    await expect(call).resolves.toEqual({ tag: 'after-respawn' });
    expect(client.generation()).toBe(2);
    await client.destroy();
  });

  test('messages and exits from a replaced child are ignored', async () => {
    const { clientPromise, children, crashes } = harness();
    children[0]!.ready();
    const client = await clientPromise;
    children[0]!.exit(139);
    await until(() => children.length === 2);
    children[1]!.ready();

    const call = client.run('doc-1', build);
    await until(() => children[1]!.sent.some((m) => m['t'] === 'dispatch'));
    const callId = children[1]!.sent.find((m) => m['t'] === 'dispatch')!['callId'] as number;

    children[0]!.result(callId, { tag: 'stale' }); // obsolete child answers
    children[0]!.exit(1); // and dies again
    expect(crashes).toHaveLength(1); // no second crash from the corpse

    children[1]!.result(callId, { tag: 'live' });
    await expect(call).resolves.toEqual({ tag: 'live' });
    await client.destroy();
  });

  test('a failed IPC send rejects its own call', async () => {
    const { clientPromise, children } = harness();
    children[0]!.ready();
    const client = await clientPromise;
    children[0]!.sendError = new Error('EPIPE');
    await expect(client.run('doc-1', build)).rejects.toThrow(/IPC send failed/);
    await client.destroy();
  });

  test('a pre-aborted signal rejects locally and sends nothing', async () => {
    const { clientPromise, children } = harness();
    children[0]!.ready();
    const client = await clientPromise;
    const ac = new AbortController();
    ac.abort(new Error('caller gone'));
    await expect(client.run('doc-1', build, ac.signal)).rejects.toThrow();
    expect(children[0]!.sent.filter((m) => m['t'] === 'dispatch')).toHaveLength(0);
    await client.destroy();
  });

  test('abort listeners are removed when their call settles', async () => {
    const { clientPromise, children } = harness();
    children[0]!.ready();
    const client = await clientPromise;
    const ac = new AbortController();

    const call = client.run('doc-1', build, ac.signal);
    await until(() => children[0]!.sent.some((m) => m['t'] === 'dispatch'));
    expect(getEventListeners(ac.signal, 'abort')).toHaveLength(1);
    const callId = children[0]!.sent.find((m) => m['t'] === 'dispatch')!['callId'] as number;
    children[0]!.result(callId);
    await call;
    expect(getEventListeners(ac.signal, 'abort')).toHaveLength(0);
    // Aborting after settle must not reach the host.
    const sends = children[0]!.sent.length;
    ac.abort();
    expect(children[0]!.sent.length).toBe(sends);
    await client.destroy();
  });

  test('an in-flight abort forwards to the host', async () => {
    const { clientPromise, children } = harness();
    children[0]!.ready();
    const client = await clientPromise;
    const ac = new AbortController();
    const call = client.run('doc-1', build, ac.signal);
    await until(() => children[0]!.sent.some((m) => m['t'] === 'dispatch'));
    ac.abort();
    await until(() => children[0]!.sent.some((m) => m['t'] === 'abort'));
    const callId = children[0]!.sent.find((m) => m['t'] === 'dispatch')!['callId'] as number;
    children[0]!.emit('message', {
      t: 'error',
      callId,
      error: { code: 'Aborted', message: 'aborted' },
    });
    await expect(call).rejects.toThrow();
    await client.destroy();
  });

  test('ready-timeout fails create() and does not leave a respawn loop behind', async () => {
    const { clientPromise, children } = harness({ readyTimeoutMs: 30 });
    await expect(clientPromise).rejects.toThrow(/ready/i);
    expect(children[0]!.kills).toContain('SIGKILL');
    const count = children.length;
    await new Promise((r) => setTimeout(r, 80));
    expect(children.length).toBe(count); // destroyed: no orphan respawns
  });

  test('memory heartbeats are generation-scoped: cleared AT exit (backoff window), repopulated by the successor', async () => {
    // Long respawn delay: the assertion below runs INSIDE the
    // death→respawn gap, where a spawn-time-only reset would still be
    // exporting the corpse's RSS.
    const h = harness({ respawnBaseMs: 300, respawnMaxMs: 300 });
    await until(() => children0Ready(h));
    h.children[0]!.ready();
    const client = await h.clientPromise;
    expect(client.memory()).toBeNull();
    h.children[0]!.emit('message', { t: 'memory', rssBytes: 123_000, heapUsedBytes: 45_000 });
    const m = client.memory();
    expect(m?.rssBytes).toBe(123_000);
    expect(m?.heapUsedBytes).toBe(45_000);
    expect(m!.ageMs).toBeGreaterThanOrEqual(0);

    h.children[0]!.exit(139);
    // Immediately after exit — no replacement child exists yet.
    expect(h.children.length).toBe(1);
    expect(client.memory()).toBeNull();
    await until(() => h.children.length === 2);
    h.children[1]!.ready();
    h.children[1]!.emit('message', { t: 'memory', rssBytes: 9, heapUsedBytes: 4 });
    expect(client.memory()?.rssBytes).toBe(9);
    await client.destroy();
  });

  test('graceful recycle: parks new work, drains, no journal strike, NO backoff', async () => {
    // Backoff would be 5s — a planned exit must respawn immediately.
    const h = harness({ respawnBaseMs: 5_000, respawnMaxMs: 5_000 });
    await until(() => h.children.length === 1);
    h.children[0]!.ready();
    const client = await h.clientPromise;

    // One in-flight job the drain must wait for.
    const inflight = client.run('doc-a', build);
    inflight.catch(() => undefined);
    await until(() => h.children[0]!.sent.some((m) => (m as { t?: string }).t === 'dispatch'));

    const recycled = client.recycle('manual', { settleWindowMs: 150 });
    // New work parks (successor will serve it) instead of racing the corpse.
    let parkedSettled = false;
    const parked = client.run('doc-b', build).then(
      (r) => {
        parkedSettled = true;
        return r;
      },
      (e) => {
        parkedSettled = true;
        throw e;
      },
    );
    expect(client.health().state).toBe('starting'); // recycling reads as starting
    await new Promise((r) => setTimeout(r, 60));
    expect(parkedSettled).toBe(false);

    // Window expires with the job still in flight → bounded shutdown sent.
    await until(() => h.children[0]!.sent.some((m) => (m as { t?: string }).t === 'shutdown'));
    h.children[0]!.exit(0);
    await recycled;
    // Immediate respawn despite the 5s backoff config = the planned path.
    await until(() => h.children.length === 2, 500);
    expect(h.crashes).toHaveLength(0); // NO journal strike
    expect(h.restarts).toHaveLength(1); // forget-everything still fired
    await expect(inflight).rejects.toThrow(/recycling/);
    expect(client.recycleStats().manual).toBe(1);

    h.children[1]!.ready();
    await until(() => h.children[1]!.sent.some((m) => (m as { t?: string }).t === 'dispatch'));
    const call = h.children[1]!.sent.find((m) => (m as { t?: string }).t === 'dispatch') as {
      callId: number;
    };
    h.children[1]!.result(call.callId, { tag: 'ok' });
    await parked; // the parked job completed on the successor
    await client.destroy();
  });

  test('an ORGANIC crash during the settle window journals as a crash, not a recycle', async () => {
    const h = harness();
    await until(() => h.children.length === 1);
    h.children[0]!.ready();
    const client = await h.clientPromise;
    const job = client.run('doc-a', build);
    job.catch(() => undefined);
    await until(() => h.children[0]!.sent.some((m) => m['t'] === 'dispatch'));
    const recycled = client.recycle('soft-rss', { settleWindowMs: 5_000 });
    // PDFium dies for real mid-drain — BEFORE any shutdown was issued.
    h.children[0]!.exit(139, null);
    await recycled;
    await until(() => h.children.length === 2);
    expect(h.crashes).toHaveLength(1); // journalled — attribution preserved
    expect(client.recycleStats()['soft-rss']).toBe(0); // no completed recycle claimed
    h.children[1]!.ready();
    await client.destroy();
  });

  test('a nonzero exit AFTER the shutdown request still journals as a crash', async () => {
    const h = harness();
    await until(() => h.children.length === 1);
    h.children[0]!.ready();
    const client = await h.clientPromise;
    const recycled = client.recycle('lifetime', { settleWindowMs: 50 });
    await until(() => h.children[0]!.sent.some((m) => m['t'] === 'shutdown'));
    // The child crashes while processing shutdown (organic, not our kill).
    h.children[0]!.exit(134, null);
    await recycled;
    await until(() => h.children.length === 2);
    expect(h.crashes).toHaveLength(1);
    expect(client.recycleStats().lifetime).toBe(0);
    h.children[1]!.ready();
    await client.destroy();
  });

  test('a HARD decision preempts an in-progress graceful drain', async () => {
    const h = harness();
    await until(() => h.children.length === 1);
    h.children[0]!.ready();
    const client = await h.clientPromise;
    const job = client.run('doc-a', build);
    job.catch(() => undefined);
    await until(() => h.children[0]!.sent.some((m) => m['t'] === 'dispatch'));
    const soft = client.recycle('soft-rss', { settleWindowMs: 10_000 });
    expect(client.health().state).toBe('starting');
    // Memory crossed the hard watermark mid-settle: escalate NOW.
    expect(await client.recycle('hard-rss', { graceful: false })).toBe(true);
    expect(h.children[0]!.kills).toContain('SIGKILL');
    h.children[0]!.exit(null, 'SIGKILL');
    await soft;
    await until(() => h.children.length === 2);
    expect(h.crashes).toHaveLength(0); // OUR kill — planned
    expect(client.recycleStats()['hard-rss']).toBe(1); // counted under the escalated reason
    h.children[1]!.ready();
    await client.destroy();
  });

  test('graceful recycle proceeds as soon as in-flight settles (no window wait)', async () => {
    const h = harness();
    await until(() => h.children.length === 1);
    h.children[0]!.ready();
    const client = await h.clientPromise;
    const job = client.run('doc-a', build);
    await until(() => h.children[0]!.sent.some((m) => (m as { t?: string }).t === 'dispatch'));
    const recycled = client.recycle('soft-rss', { settleWindowMs: 10_000 });
    const call = h.children[0]!.sent.find((m) => (m as { t?: string }).t === 'dispatch') as {
      callId: number;
    };
    h.children[0]!.result(call.callId, { tag: 'ok' });
    await job;
    // Well before the 10s window: the drain loop sees zero in flight.
    await until(
      () => h.children[0]!.sent.some((m) => (m as { t?: string }).t === 'shutdown'),
      2_000,
    );
    h.children[0]!.exit(0);
    await recycled;
    await until(() => h.children.length === 2);
    expect(h.crashes).toHaveLength(0);
    await client.destroy();
  });

  test('hard recycle kills immediately; recycle on a non-ready host is refused', async () => {
    const h = harness();
    await until(() => h.children.length === 1);
    h.children[0]!.ready();
    const client = await h.clientPromise;
    const job = client.run('doc-a', build);
    job.catch(() => undefined);
    await until(() => h.children[0]!.sent.some((m) => (m as { t?: string }).t === 'dispatch'));
    expect(await client.recycle('hard-rss', { graceful: false })).toBe(true);
    expect(h.children[0]!.kills).toContain('SIGKILL');
    h.children[0]!.exit(null, 'SIGKILL');
    await expect(job).rejects.toThrow(/recycling/);
    expect(h.crashes).toHaveLength(0);
    // Mid-respawn: not recyclable.
    expect(await client.recycle('manual')).toBe(false);
    await until(() => h.children.length === 2);
    h.children[1]!.ready();
    await client.destroy();
  });

  test('a protocol mismatch is refused at create()', async () => {
    const { clientPromise, children } = harness();
    children[0]!.emit('message', { t: 'ready', protocol: 999, pid: 1, engineBuild: 'x' });
    await expect(clientPromise).rejects.toThrow(/protocol/);
  });

  test('init-error fails create() with the host message', async () => {
    const { clientPromise, children } = harness();
    children[0]!.emit('message', { t: 'init-error', error: 'font not found: /x.ttf' });
    await expect(clientPromise).rejects.toThrow(/font not found/);
  });

  test('the admission cap refuses excess in-flight dispatches', async () => {
    const { clientPromise, children } = harness({ maxInFlight: 2 });
    children[0]!.ready();
    const client = await clientPromise;
    const a = client.run('d1', build).catch(() => undefined);
    const b = client.run('d2', build).catch(() => undefined);
    await until(() => children[0]!.sent.filter((m) => m['t'] === 'dispatch').length === 2);
    await expect(client.run('d3', build)).rejects.toThrow(/saturated/);
    await client.destroy();
    await Promise.all([a, b]);
  });

  test('respawn backoff grows per failure and respawns keep coming', async () => {
    const { clientPromise, children, spawnedAt } = harness();
    children[0]!.ready();
    const client = await clientPromise;

    children[0]!.exit(139);
    await until(() => children.length === 2);
    children[1]!.exit(139);
    await until(() => children.length === 3);
    children[2]!.exit(139);
    await until(() => children.length === 4);

    const gap1 = spawnedAt[1]! - spawnedAt[0]!;
    const gap2 = spawnedAt[2]! - spawnedAt[1]!;
    const gap3 = spawnedAt[3]! - spawnedAt[2]!;
    expect(gap2).toBeGreaterThanOrEqual(gap1);
    expect(gap3).toBeGreaterThanOrEqual(gap2);
    await client.destroy();
  });

  test('crash suspects carry the residency mirror; journal precedes restart', async () => {
    const order: string[] = [];
    const { clientPromise, children, crashes } = harness({
      onHostCrash: (evt) => {
        order.push('crash');
        crashes.push(evt);
      },
      onHostRestart: () => order.push('restart'),
    });
    children[0]!.ready();
    const client = await clientPromise;

    const open = client.runOpen('doc-1', 'sha-abc', build);
    await until(() => children[0]!.sent.some((m) => m['t'] === 'dispatch'));
    const openId = children[0]!.sent.find((m) => m['t'] === 'dispatch')!['callId'] as number;
    children[0]!.result(openId);
    await open; // residency: doc-1 → sha-abc

    const inFlight = client.run('doc-1', build).catch(() => undefined);
    await until(() => children[0]!.sent.filter((m) => m['t'] === 'dispatch').length === 2);
    children[0]!.exit(139, null);

    await inFlight;
    expect(order).toEqual(['crash', 'restart']);
    expect(crashes).toHaveLength(1);
    expect(crashes[0]!.engineBuild).toBe('test-build');
    expect(crashes[0]!.suspects).toEqual([
      expect.objectContaining({ docId: 'doc-1', baseSha: 'sha-abc' }),
    ]);
    await client.destroy();
  });

  test('evict events forward and clear residency', async () => {
    const { clientPromise, children, evictions, crashes } = harness();
    children[0]!.ready();
    const client = await clientPromise;

    const open = client.runOpen('doc-1', 'sha-abc', build);
    await until(() => children[0]!.sent.some((m) => m['t'] === 'dispatch'));
    children[0]!.result(children[0]!.sent.find((m) => m['t'] === 'dispatch')!['callId'] as number);
    await open;

    children[0]!.emit('message', { t: 'evict', docId: 'doc-1', baseSha: 'sha-abc', slot: 0 });
    expect(evictions).toEqual([{ docId: 'doc-1', baseSha: 'sha-abc', slot: 0 }]);

    // Post-evict crashes must not attribute the evicted residency.
    const call = client.run('doc-1', build).catch(() => undefined);
    await until(() => children[0]!.sent.filter((m) => m['t'] === 'dispatch').length === 2);
    children[0]!.exit(139);
    await call;
    expect(crashes[0]!.suspects).toEqual([
      expect.objectContaining({ docId: 'doc-1', baseSha: null }),
    ]);
    await client.destroy();
  });

  test('close on a dead host resolves null instead of throwing', async () => {
    const { clientPromise, children } = harness();
    children[0]!.ready();
    const client = await clientPromise;
    children[0]!.exit(139);
    await expect(client.close('doc-1')).resolves.toBeNull();
    await client.destroy();
  });

  test('destroy() rejects in-flight and survives a hung shutdown', async () => {
    vi.useRealTimers();
    const { clientPromise, children } = harness();
    children[0]!.ready();
    const client = await clientPromise;
    const call = client.run('doc-1', build);
    await until(() => children[0]!.sent.some((m) => m['t'] === 'dispatch'));
    const destroyed = client.destroy();
    await expect(call).rejects.toThrow(/destroyed/);
    // The fake never answers the shutdown control; the 2s bound SIGKILLs.
    await destroyed;
    expect(children[0]!.kills).toContain('SIGKILL');
  }, 10_000);
});

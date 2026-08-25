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
    expect(crashes[0]!.suspects).toEqual([expect.objectContaining({ docId: 'doc-1', baseSha: null })]);
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

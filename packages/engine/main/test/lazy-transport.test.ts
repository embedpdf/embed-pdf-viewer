import {
  EngineErrorCode,
  wirePack,
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, test, vi } from 'vitest';

import { LazyTransport } from '../src/transport/LazyTransport';
import type { Transport } from '../src/transport/Transport';

/** Minimal recording inner transport: remembers packs, can emit responses. */
class RecordingTransport implements Transport {
  readonly sent: WirePack<WorkerRequest>[] = [];
  readonly listeners = new Set<(msg: WorkerResponse) => void>();
  terminated = false;

  send(pack: WirePack<WorkerRequest>): void {
    this.sent.push(pack);
  }
  onMessage(handler: (msg: WorkerResponse) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }
  async terminate(): Promise<void> {
    this.terminated = true;
  }
  emit(msg: WorkerResponse): void {
    for (const fn of this.listeners) fn(msg);
  }
}

const pack = (jobId: number): WirePack<WorkerRequest> =>
  wirePack({ kind: 'fonts.clearFallbacks', jobId });

const microtasks = () => new Promise<void>((r) => setTimeout(r, 0));

describe('LazyTransport', () => {
  test('construction does not boot; first send triggers the boot exactly once', async () => {
    const inner = new RecordingTransport();
    const boot = vi.fn(async () => inner as Transport);
    const lazy = new LazyTransport(boot);

    expect(boot).not.toHaveBeenCalled();

    lazy.send(pack(1));
    lazy.send(pack(2));
    expect(boot).toHaveBeenCalledTimes(1);
    // Not flushed yet — the boot promise hasn't resolved.
    expect(inner.sent).toHaveLength(0);

    await microtasks();
    expect(inner.sent.map((p) => p.payload.jobId)).toEqual([1, 2]); // FIFO
    // Post-boot sends pass straight through.
    lazy.send(pack(3));
    expect(inner.sent.map((p) => p.payload.jobId)).toEqual([1, 2, 3]);
  });

  test('start() boots without sending and is idempotent', async () => {
    const inner = new RecordingTransport();
    const boot = vi.fn(async () => inner as Transport);
    const lazy = new LazyTransport(boot);

    const first = lazy.start();
    const second = lazy.start();
    expect(first).toBe(second);
    await first;

    expect(boot).toHaveBeenCalledTimes(1);
    expect(inner.sent).toHaveLength(0);
  });

  test('responses from the inner transport reach subscribers', async () => {
    const inner = new RecordingTransport();
    const lazy = new LazyTransport(async () => inner);

    const seen: WorkerResponse[] = [];
    lazy.onMessage((msg) => seen.push(msg));

    await lazy.start();
    inner.emit({ kind: 'resolve', jobId: 7, result: { tag: 'fonts.clearFallbacks' } });
    expect(seen).toEqual([{ kind: 'resolve', jobId: 7, result: { tag: 'fonts.clearFallbacks' } }]);
  });

  test('boot failure rejects every buffered pack and all future sends', async () => {
    const lazy = new LazyTransport(async () => {
      throw new Error('wasm compile failed');
    });

    const seen: WorkerResponse[] = [];
    lazy.onMessage((msg) => seen.push(msg));

    lazy.send(pack(1));
    lazy.send(pack(2));
    await microtasks();

    expect(seen.map((m) => m.jobId)).toEqual([1, 2]);
    for (const msg of seen) {
      expect(msg.kind).toBe('reject');
      if (msg.kind === 'reject') {
        expect(msg.error.code).toBe(EngineErrorCode.RuntimeUnavailable);
        expect(msg.error.message).toMatch(/wasm compile failed/);
      }
    }

    // The failed state is permanent — later jobs reject too, without re-booting.
    lazy.send(pack(3));
    await microtasks();
    expect(seen.map((m) => m.jobId)).toEqual([1, 2, 3]);
  });

  test('terminate before any boot never spawns the inner transport', async () => {
    const boot = vi.fn(async () => new RecordingTransport() as Transport);
    const lazy = new LazyTransport(boot);
    await lazy.terminate();
    expect(boot).not.toHaveBeenCalled();
  });

  test('onAbandon fires when terminated before the boot ever started', async () => {
    const onAbandon = vi.fn();
    const lazy = new LazyTransport(async () => new RecordingTransport() as Transport, {
      onAbandon,
    });
    await lazy.terminate();
    expect(onAbandon).toHaveBeenCalledTimes(1);
    // terminate() is idempotent — the hook must not fire again.
    await lazy.terminate();
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  test('onAbandon does NOT fire once a boot has started — the boot owns cleanup', async () => {
    const inner = new RecordingTransport();
    const onAbandon = vi.fn();
    const lazy = new LazyTransport(async () => inner as Transport, { onAbandon });

    await lazy.start();
    await lazy.terminate();

    expect(onAbandon).not.toHaveBeenCalled();
    expect(inner.terminated).toBe(true);
  });

  test('terminate racing an in-flight boot tears the fresh transport down', async () => {
    const inner = new RecordingTransport();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const lazy = new LazyTransport(async () => {
      await gate;
      return inner;
    });

    lazy.send(pack(1));
    const terminating = lazy.terminate();
    release();
    await terminating;

    expect(inner.terminated).toBe(true);
    expect(inner.sent).toHaveLength(0); // buffer was dropped, not flushed
  });

  test('terminate after boot terminates the inner transport', async () => {
    const inner = new RecordingTransport();
    const lazy = new LazyTransport(async () => inner);
    await lazy.start();
    await lazy.terminate();
    expect(inner.terminated).toBe(true);
  });

  test('a shutdown pack on a never-booted transport resolves without booting', async () => {
    const boot = vi.fn(async () => new RecordingTransport() as Transport);
    const lazy = new LazyTransport(boot);

    const seen: WorkerResponse[] = [];
    lazy.onMessage((msg) => seen.push(msg));

    lazy.send(wirePack({ kind: 'shutdown', jobId: 42 }));
    await microtasks();

    expect(boot).not.toHaveBeenCalled();
    expect(seen).toEqual([{ kind: 'resolve', jobId: 42, result: { tag: 'shutdown' } }]);
  });
});

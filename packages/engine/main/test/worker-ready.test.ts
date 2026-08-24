/**
 * watchWorkerReady must settle for every way a worker can end its handshake —
 * including workers whose SCRIPT never runs (bad URL, CSP rejection, syntax
 * error), which fire `error` instead of any message and used to hang forever.
 */
import { describe, expect, test } from 'vitest';

import { watchWorkerReady } from '../src/transport/BrowserWorkerTransport';

class HandshakeWorker {
  private readonly listeners = new Map<string, Set<(e: unknown) => void>>();

  addEventListener(type: string, fn: (e: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  dispatch(type: string, event: unknown): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
  listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

const asWorker = (w: HandshakeWorker) => w as unknown as Worker;

describe('watchWorkerReady', () => {
  test('resolves on the ready message and detaches every listener', async () => {
    const worker = new HandshakeWorker();
    const ready = watchWorkerReady(asWorker(worker));
    worker.dispatch('message', { data: { kind: 'ready' } });
    await expect(ready).resolves.toBeUndefined();
    expect(worker.listenerCount()).toBe(0);
  });

  test('rejects on init-error with the worker-provided description', async () => {
    const worker = new HandshakeWorker();
    const ready = watchWorkerReady(asWorker(worker));
    worker.dispatch('message', { data: { kind: 'init-error', error: 'wasm fetch failed' } });
    await expect(ready).rejects.toThrow(/wasm fetch failed/);
    expect(worker.listenerCount()).toBe(0);
  });

  test('rejects when the worker script itself fails (error event) instead of hanging', async () => {
    const worker = new HandshakeWorker();
    const ready = watchWorkerReady(asWorker(worker));
    worker.dispatch('error', { message: 'SyntaxError: unexpected token' });
    await expect(ready).rejects.toThrow(/SyntaxError: unexpected token/);
    expect(worker.listenerCount()).toBe(0);
  });

  test('an error event without a message still rejects with a teaching description', async () => {
    const worker = new HandshakeWorker();
    const ready = watchWorkerReady(asWorker(worker));
    worker.dispatch('error', { message: '' });
    await expect(ready).rejects.toThrow(/bad worker URL|Content-Security-Policy/);
  });

  test('rejects on messageerror (handshake message could not be deserialized)', async () => {
    const worker = new HandshakeWorker();
    const ready = watchWorkerReady(asWorker(worker));
    worker.dispatch('messageerror', {});
    await expect(ready).rejects.toThrow(/could not be deserialized/);
  });

  test('unrelated messages before the handshake are ignored', async () => {
    const worker = new HandshakeWorker();
    const ready = watchWorkerReady(asWorker(worker));
    worker.dispatch('message', { data: { kind: 'resolve', jobId: 1 } });
    worker.dispatch('message', { data: 'noise' });
    worker.dispatch('message', { data: { kind: 'ready' } });
    await expect(ready).resolves.toBeUndefined();
  });
});

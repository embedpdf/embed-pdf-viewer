import {
  EngineError,
  EngineErrorCode,
  serializeError,
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
} from '@embedpdf/engine-core/runtime';

import type { Transport } from './Transport';

/**
 * A {@link Transport} that defers creating the real transport (Web Worker
 * spawn + WASM compile, or inline runtime creation) until it is first needed.
 *
 * This is what makes `LocalEngine` synchronously constructible: the engine,
 * its `WorkerQueue`, and its `FontService` are all plain objects wired to a
 * LazyTransport; nothing above this class ever awaits readiness. The queue is
 * fully jobId-correlated, so packs sent before the boot finishes are simply
 * buffered here and flushed FIFO once the inner transport resolves.
 *
 * Failure semantics: if the boot rejects, the transport enters a permanent
 * failed state and synthesizes a `{ kind: 'reject' }` response for every
 * buffered pack and every future send. The WorkerQueue already handles reject
 * responses, so pending `open()`/`render()` calls reject with a real
 * `EngineError` instead of hanging.
 */
export interface LazyTransportOptions {
  /**
   * Invoked by `terminate()` when the boot never started. Lets a caller who
   * handed over pre-allocated resources (a live `Worker`) reclaim them: the
   * boot factory never ran, so nothing else knows they exist.
   */
  onAbandon?: () => void;
}

export class LazyTransport implements Transport {
  private readonly listeners = new Set<(msg: WorkerResponse) => void>();
  private readonly pendingPacks: WirePack<WorkerRequest>[] = [];
  private inner: Transport | undefined;
  private innerUnsubscribe: (() => void) | undefined;
  private bootPromise: Promise<void> | undefined;
  private bootError: EngineError | undefined;
  private terminated = false;

  constructor(
    private readonly boot: () => Promise<Transport>,
    private readonly options: LazyTransportOptions = {},
  ) {}

  /**
   * Trigger the boot without sending anything — used by `Engine.warmup()` so
   * the WASM compile can start in parallel with app/plugin initialization.
   *
   * Idempotent. The returned promise settles when the boot settles but never
   * rejects; boot failures surface through the per-job reject responses.
   */
  start(): Promise<void> {
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = this.runBoot();
    return this.bootPromise;
  }

  send(pack: WirePack<WorkerRequest>): void {
    if (this.terminated) return;
    if (this.bootError) {
      this.rejectPack(pack, this.bootError);
      return;
    }
    if (this.inner) {
      this.inner.send(pack);
      return;
    }
    // A shutdown on a never-booted transport must not spawn a worker just to
    // kill it. Synthesize the resolve the queue's settle listener waits for.
    if (this.bootPromise === undefined && pack.payload.kind === 'shutdown') {
      this.deliverAsync({
        kind: 'resolve',
        jobId: pack.payload.jobId,
        result: { tag: 'shutdown' },
      });
      return;
    }
    this.pendingPacks.push(pack);
    void this.start();
  }

  onMessage(handler: (msg: WorkerResponse) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async terminate(): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;
    this.pendingPacks.length = 0;
    if (this.bootPromise === undefined) {
      // Boot never started: the factory never ran, so only the caller-supplied
      // abandon hook can reclaim pre-allocated resources (a live Worker).
      this.listeners.clear();
      this.options.onAbandon?.();
      return;
    }
    // A boot is in flight (or done): wait for it so a freshly spawned worker
    // is terminated rather than leaked (runBoot handles the terminated case).
    await this.bootPromise;
    this.listeners.clear();
    if (this.inner) {
      this.innerUnsubscribe?.();
      const inner = this.inner;
      this.inner = undefined;
      await inner.terminate();
    }
  }

  private async runBoot(): Promise<void> {
    try {
      const inner = await this.boot();
      if (this.terminated) {
        // Termination raced the boot: the wrapper is already dead, so the
        // freshly created transport must be torn down, not adopted.
        await inner.terminate().catch(() => {});
        return;
      }
      this.inner = inner;
      this.innerUnsubscribe = inner.onMessage((msg) => this.deliver(msg));
      for (const pack of this.pendingPacks.splice(0)) {
        inner.send(pack);
      }
    } catch (cause) {
      this.bootError = new EngineError(
        EngineErrorCode.RuntimeUnavailable,
        `engine failed to boot: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
      const failed = this.pendingPacks.splice(0);
      for (const pack of failed) {
        this.rejectPack(pack, this.bootError);
      }
    }
  }

  private rejectPack(pack: WirePack<WorkerRequest>, error: EngineError): void {
    this.deliverAsync({
      kind: 'reject',
      jobId: pack.payload.jobId,
      error: serializeError(error),
    });
  }

  private deliverAsync(msg: WorkerResponse): void {
    // Async delivery preserves Promise-style ordering (same contract as
    // InlineTransport): synchronous caller code finishes before handlers run.
    queueMicrotask(() => this.deliver(msg));
  }

  private deliver(msg: WorkerResponse): void {
    if (this.terminated) return;
    for (const fn of this.listeners) {
      try {
        fn(msg);
      } catch {
        // swallow listener errors
      }
    }
  }
}

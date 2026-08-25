import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { WorkerResultPayload } from '@embedpdf/engine-core/runtime';

import type { BuildPack, EnginePool, RunAdHocOptions } from './EnginePool';

/**
 * C1 — the engine plane's admission control, as a decorator at the ONE
 * choke point every engine job passes (the parent dispatch path, which
 * sees all work with zero coordination — budgets fragment when split
 * across shards).
 *
 * Two lanes:
 *   - `interactive` (the DEFAULT for everything): work a caller is
 *     waiting on — `run`/`runOpen`, and `runAdHoc` unless it says
 *     otherwise. May use EVERY slot.
 *   - `background` (explicit opt-in via `runAdHoc(..., { lane:
 *     'background' })`): known-disposable work — today exactly the
 *     thumbnail warm. BOUNDED OCCUPANCY with interactive-first
 *     admission — honest scope: already-DISPATCHED background work is
 *     never preempted (a busy worker finishes its job), so at small
 *     pools one in-flight warm can still delay an arriving interactive
 *     request by up to one job. `backgroundMaxInFlight: 0` is the
 *     strict-disable for such deployments: background sheds instantly.
 *
 * Beyond the caps, callers queue (bounded, FIFO per lane); beyond the
 * queues or their wait deadlines, jobs SHED with {@link EngineBusyError}
 * — honest backpressure (503 at the route layer) instead of an unbounded
 * pile-up. A shed background warm is free by design ("the read-through
 * is the system"); a shed interactive job is the overload signal.
 *
 * `close`/`destroy` and the read-only surface pass through unthrottled:
 * close FREES resources — blocking it behind admission could deadlock a
 * full pool against its own relief valve.
 */

/** Server-local (never crosses the wire): the engine plane refused
 *  admission. The app error handler maps it to 503 + Retry-After — the
 *  same pattern as `DocumentQuarantinedError` → 422. */
export class EngineBusyError extends Error {
  readonly code = 'EngineBusy';
  constructor(
    readonly lane: SchedulingLane,
    message: string,
  ) {
    super(message);
  }
}

export type SchedulingLane = 'interactive' | 'background';

export interface EngineSchedulingConfig {
  /** Hard cap on concurrently dispatched engine jobs. Default:
   *  slots × 2 — every worker busy plus one pipelined behind it; beyond
   *  that, waiting happens HERE, where it is observable. */
  maxInFlight?: number;
  /** Of maxInFlight, how many background may occupy.
   *  Default: max(1, floor(slots / 2)). `0` = strict disable: every
   *  background job sheds immediately (one-worker deployments that want
   *  zero warm interference). */
  backgroundMaxInFlight?: number;
  backgroundMaxQueued?: number; // default 64
  interactiveMaxQueued?: number; // default 256
  backgroundQueueTimeoutMs?: number; // default 5_000
  interactiveQueueTimeoutMs?: number; // default 15_000
  /** Observation hook: called once per DISPATCHED job that waited in
   *  queue, with its wait. Feeds the /metrics queue-wait histogram;
   *  never called for sheds/aborts. */
  onQueueWait?: (lane: SchedulingLane, waitMs: number) => void;
}

export interface LaneStats {
  queueDepth: number;
  inFlight: number;
  shedsTotal: number;
  /** Sum/count of queue waits (ms) for dispatched jobs — avg via rate(). */
  queueWaitMsSum: number;
  queueWaitCount: number;
}

interface Waiter {
  lane: SchedulingLane;
  enqueuedAt: number;
  resolve: () => void;
  reject: (err: unknown) => void;
  timer: NodeJS.Timeout;
  signal: AbortSignal | undefined;
  onAbort: (() => void) | undefined;
  settled: boolean;
}

export class SchedulingEnginePool implements EnginePool {
  private readonly cfg: Required<Omit<EngineSchedulingConfig, 'onQueueWait'>>;
  private readonly onQueueWait: ((lane: SchedulingLane, waitMs: number) => void) | undefined;
  private inFlightTotal = 0;
  private readonly lanes: Record<
    SchedulingLane,
    { inFlight: number; queue: Waiter[]; sheds: number; waitSum: number; waitCount: number }
  > = {
    interactive: { inFlight: 0, queue: [], sheds: 0, waitSum: 0, waitCount: 0 },
    background: { inFlight: 0, queue: [], sheds: 0, waitSum: 0, waitCount: 0 },
  };

  constructor(
    private readonly inner: EnginePool,
    cfg: EngineSchedulingConfig = {},
  ) {
    const slots = Math.max(1, this.inner.stats().slots);
    this.cfg = {
      maxInFlight: Math.max(1, cfg.maxInFlight ?? slots * 2),
      backgroundMaxInFlight: Math.max(
        0,
        cfg.backgroundMaxInFlight ?? Math.max(1, Math.floor(slots / 2)),
      ),
      backgroundMaxQueued: Math.max(0, cfg.backgroundMaxQueued ?? 64),
      interactiveMaxQueued: Math.max(0, cfg.interactiveMaxQueued ?? 256),
      backgroundQueueTimeoutMs: Math.max(1, cfg.backgroundQueueTimeoutMs ?? 5_000),
      interactiveQueueTimeoutMs: Math.max(1, cfg.interactiveQueueTimeoutMs ?? 15_000),
    };
    this.onQueueWait = cfg.onQueueWait;
  }

  private hasCapacity(lane: SchedulingLane): boolean {
    if (this.inFlightTotal >= this.cfg.maxInFlight) return false;
    if (lane === 'background' && this.lanes.background.inFlight >= this.cfg.backgroundMaxInFlight)
      return false;
    return true;
  }

  private async admit(lane: SchedulingLane, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new EngineError(EngineErrorCode.Aborted, 'aborted before dispatch');
    if (lane === 'background' && this.cfg.backgroundMaxInFlight === 0) {
      // Strict disable: queueing would never drain — shed NOW.
      this.lanes.background.sheds += 1;
      throw new EngineBusyError('background', 'background lane disabled (backgroundMaxInFlight=0)');
    }
    if (this.hasCapacity(lane)) {
      this.inFlightTotal += 1;
      this.lanes[lane].inFlight += 1;
      return;
    }
    const st = this.lanes[lane];
    const maxQueued =
      lane === 'background' ? this.cfg.backgroundMaxQueued : this.cfg.interactiveMaxQueued;
    if (st.queue.length >= maxQueued) {
      st.sheds += 1;
      throw new EngineBusyError(
        lane,
        `engine ${lane} queue full (${st.queue.length} waiting, ${this.inFlightTotal} in flight)`,
      );
    }
    const timeoutMs =
      lane === 'background'
        ? this.cfg.backgroundQueueTimeoutMs
        : this.cfg.interactiveQueueTimeoutMs;
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        lane,
        enqueuedAt: Date.now(),
        resolve,
        reject,
        signal,
        onAbort: undefined,
        settled: false,
        timer: setTimeout(() => {
          this.remove(waiter);
          st.sheds += 1;
          reject(
            new EngineBusyError(lane, `engine ${lane} admission timed out after ${timeoutMs}ms`),
          );
        }, timeoutMs),
      };
      waiter.timer.unref?.();
      if (signal) {
        const onAbort = (): void => {
          this.remove(waiter);
          reject(new EngineError(EngineErrorCode.Aborted, 'aborted while queued'));
        };
        waiter.onAbort = onAbort;
        signal.addEventListener('abort', onAbort, { once: true });
      }
      st.queue.push(waiter);
    });
  }

  /** Detach a waiter from its queue + timers; idempotent. */
  private remove(w: Waiter): void {
    if (w.settled) return;
    w.settled = true;
    clearTimeout(w.timer);
    if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort);
    const q = this.lanes[w.lane].queue;
    const i = q.indexOf(w);
    if (i >= 0) q.splice(i, 1);
  }

  private release(lane: SchedulingLane): void {
    this.inFlightTotal -= 1;
    this.lanes[lane].inFlight -= 1;
    this.pump();
  }

  /** Grant freed capacity: interactive first, then background under its cap. */
  private pump(): void {
    for (const lane of ['interactive', 'background'] as const) {
      const st = this.lanes[lane];
      while (st.queue.length > 0 && this.hasCapacity(lane)) {
        const w = st.queue[0]!;
        this.remove(w);
        this.inFlightTotal += 1;
        st.inFlight += 1;
        const waitMs = Date.now() - w.enqueuedAt;
        st.waitSum += waitMs;
        st.waitCount += 1;
        this.onQueueWait?.(lane, waitMs);
        w.resolve();
      }
    }
  }

  private async withSlot<T>(
    lane: SchedulingLane,
    signal: AbortSignal | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.admit(lane, signal);
    try {
      return await fn();
    } finally {
      this.release(lane);
    }
  }

  runOpen(
    docId: string,
    baseSha: string,
    build: BuildPack,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload>;
  runOpen(docId: string, build: BuildPack, signal?: AbortSignal): Promise<WorkerResultPayload>;
  runOpen(
    docId: string,
    a: string | BuildPack,
    b?: BuildPack | AbortSignal,
    c?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    if (typeof a === 'string') {
      const signal = c;
      return this.withSlot('interactive', signal, () =>
        this.inner.runOpen(docId, a, b as BuildPack, signal),
      );
    }
    const signal = b as AbortSignal | undefined;
    return this.withSlot('interactive', signal, () => this.inner.runOpen(docId, a, signal));
  }

  run(docId: string, build: BuildPack, signal?: AbortSignal): Promise<WorkerResultPayload> {
    return this.withSlot('interactive', signal, () => this.inner.run(docId, build, signal));
  }

  runAdHoc(
    baseSha: string | undefined,
    build: BuildPack,
    signal?: AbortSignal,
    opts?: RunAdHocOptions,
  ): Promise<WorkerResultPayload> {
    const lane: SchedulingLane = opts?.lane === 'background' ? 'background' : 'interactive';
    return this.withSlot(lane, signal, () => this.inner.runAdHoc(baseSha, build, signal, opts));
  }

  /** Unthrottled: closing frees resources — never park it behind admission. */
  close(docId: string, signal?: AbortSignal): Promise<WorkerResultPayload | null> {
    return this.inner.close(docId, signal);
  }

  async destroy(): Promise<void> {
    // Reject everything still queued so no caller parks on a dead pool.
    for (const lane of ['interactive', 'background'] as const) {
      for (const w of [...this.lanes[lane].queue]) {
        this.remove(w);
        w.reject(new EngineError(EngineErrorCode.RuntimeUnavailable, 'pool destroyed'));
      }
    }
    await this.inner.destroy();
  }

  inspect(): Array<{ slot: number; docIds: string[]; baseShas: string[] }> {
    return this.inner.inspect();
  }

  stats(): { slots: number; docs: number; inFlight: number } {
    return this.inner.stats();
  }

  generation(): number {
    return this.inner.generation();
  }

  generationFor(docId: string): number {
    return this.inner.generationFor(docId);
  }

  health(): { state: 'ready' | 'starting' | 'backoff'; downSinceMs: number | null } {
    return this.inner.health();
  }

  /** Per-lane admission state for /metrics. */
  schedulingStats(): Record<SchedulingLane, LaneStats> {
    const snap = (lane: SchedulingLane): LaneStats => ({
      queueDepth: this.lanes[lane].queue.length,
      inFlight: this.lanes[lane].inFlight,
      shedsTotal: this.lanes[lane].sheds,
      queueWaitMsSum: this.lanes[lane].waitSum,
      queueWaitCount: this.lanes[lane].waitCount,
    });
    return { interactive: snap('interactive'), background: snap('background') };
  }
}

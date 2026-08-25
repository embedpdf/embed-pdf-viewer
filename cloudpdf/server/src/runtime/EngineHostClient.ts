import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  AbortError,
  EngineError,
  EngineErrorCode,
  deserializeError,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

import type { BuildPack, EnginePool } from './EnginePool';
import {
  HOST_PROTOCOL_VERSION,
  hostEnvWhitelist,
  type HostBootConfig,
  type HostControlResult,
  type HostMessage,
  type HostRequest,
} from './host-protocol';

/** What was in flight when the host died — the crash journal's input. */
export interface HostCrashSuspect {
  baseSha: string | null;
  docId: string | null;
  opKind: string;
}

export interface HostCrashEvent {
  suspects: HostCrashSuspect[];
  code: number | null;
  signal: string | null;
  engineBuild: string | null;
}

/** Minimal child surface — injectable for lifecycle tests. */
export interface ChildLike {
  pid?: number | undefined;
  send(msg: unknown, callback?: (err: Error | null) => void): boolean;
  on(event: 'message', fn: (msg: unknown) => void): unknown;
  on(event: 'exit', fn: (code: number | null, signal: string | null) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface EngineHostClientOptions {
  /** dist/runtime/engine-host-entry.js (or a TS path under a loader in tests). */
  hostEntry: URL | string;
  boot: HostBootConfig;
  /** Forwarded pool eviction — pinned-file release upstream depends on it. */
  onEvict?: (evt: { docId: string; baseSha: string; slot: number }) => void;
  /** Called after EVERY host death, before respawn: forget-everything (§4 of the plan). */
  onHostRestart?: () => void;
  /** Crash journal hook. Must be cheap/synchronous-safe: called between
   *  in-flight rejection and respawn scheduling; durable work inside it
   *  must be fire-and-forget (provisional attribution lives in memory). */
  onHostCrash?: (evt: HostCrashEvent) => void;
  readyTimeoutMs?: number; // default 15_000
  /** How long a dispatch may wait for a (re)starting host. */
  dispatchDeadlineMs?: number; // default 10_000
  /** Admission cap: dispatches beyond this many in-flight are refused. */
  maxInFlight?: number; // default 512
  respawnBaseMs?: number; // default 250, ×2 per failure, cap respawnMaxMs
  respawnMaxMs?: number; // default 5_000
  healthyResetMs?: number; // default 60_000 of uptime resets backoff
  /** Graceful-shutdown bound in destroy() before SIGKILL. */
  shutdownTimeoutMs?: number; // default 2_000
  /** Test seam: replaces child_process.fork. */
  forkImpl?: (entry: string, env: NodeJS.ProcessEnv) => ChildLike;
  /** Test seam: forwarded to fork's execArgv (e.g. ['--import','tsx']). */
  execArgv?: string[];
}

interface PendingCall {
  gen: number;
  kind: 'work' | 'control';
  resolve: (r: WorkerResultPayload | HostControlResult) => void;
  reject: (e: unknown) => void;
  cleanupAbort: () => void;
  suspect: HostCrashSuspect | null;
}

type HostState = 'starting' | 'ready' | 'backoff' | 'destroyed';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A rotated-away ready promise may end up unawaited; its rejection is
  // handled by whoever raced it (or nobody, legitimately).
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

function unavailable(message: string): EngineError {
  return new EngineError(EngineErrorCode.RuntimeUnavailable, message);
}

const INSPECT_REFRESH_MS = 5_000;

/**
 * Host-mode EnginePool: supervises the engine-host child process.
 *
 * Lifecycle laws (each one exists because its absence was a review-found
 * bug):
 *  - The ready promise ROTATES to a new unresolved instance the moment
 *    the host exits — dispatches in the death→respawn gap park on it
 *    instead of racing a corpse.
 *  - The child reference nulls on exit and every handler/timer/pending
 *    call carries a generation; anything from a replaced child is
 *    ignored.
 *  - Every `send` has a callback that rejects ITS call — a closed IPC
 *    channel is a rejection, never a silent drop.
 *  - Pre-aborted dispatches reject locally and never reach the host;
 *    abort listeners are removed when their call settles.
 *  - `create()` is async and awaits the FIRST ready, so boot failures
 *    (bad fonts, missing native runtime) fail buildApp exactly like the
 *    inline pool's create() does.
 */
export class EngineHostClient implements EnginePool {
  private state: HostState = 'starting';
  private gen = 0;
  private child: ChildLike | null = null;
  private ready = deferred<void>();
  private nextCallId = 1;
  private readonly inFlight = new Map<number, PendingCall>();
  /** docId → baseSha, so `run()` crashes attribute (plan §5.1). */
  private readonly residency = new Map<string, string>();
  private downSince: number | null = Date.now();
  private engineBuild: string | null = null;
  private respawnDelayMs: number;
  private respawnTimer: NodeJS.Timeout | null = null;
  private healthyTimer: NodeJS.Timeout | null = null;
  private inspectTimer: NodeJS.Timeout | null = null;
  private lastInspect: Array<{ slot: number; docIds: string[]; baseShas: string[] }> = [];

  static async create(opts: EngineHostClientOptions): Promise<EngineHostClient> {
    const client = new EngineHostClient(opts);
    client.spawn();
    try {
      await client.ready.promise;
      // Prime the inspect mirror so stats()/inspect() are truthful from
      // the first scrape (bounded: a slow host must not stall boot).
      await client.primeInspect(2_000);
    } catch (err) {
      // First-boot failure must FAIL buildApp (bad fonts, missing native
      // runtime) — and must not leave an orphan client respawning behind
      // the thrown exception.
      await client.destroy();
      throw err;
    }
    return client;
  }

  private constructor(private readonly opts: EngineHostClientOptions) {
    this.respawnDelayMs = opts.respawnBaseMs ?? 250;
  }

  // ---------------------------------------------------------------- spawn

  private spawn(): void {
    if (this.state === 'destroyed') return;
    const gen = ++this.gen;
    this.state = 'starting';
    const entry =
      typeof this.opts.hostEntry === 'string'
        ? this.opts.hostEntry
        : fileURLToPath(this.opts.hostEntry);
    const env = hostEnvWhitelist(this.opts.boot);
    const child: ChildLike = this.opts.forkImpl
      ? this.opts.forkImpl(entry, env)
      : (fork(entry, [], {
          serialization: 'advanced',
          env,
          ...(this.opts.execArgv ? { execArgv: this.opts.execArgv } : {}),
        }) as ChildProcess);
    this.child = child;

    const readyTimer = setTimeout(() => {
      if (this.gen !== gen) return;
      // The kill produces an 'exit', which transitions state + rotates.
      child.kill('SIGKILL');
      this.ready.reject(new Error('engine host did not become ready in time'));
    }, this.opts.readyTimeoutMs ?? 15_000);
    readyTimer.unref?.();

    child.on('message', (raw: unknown) => {
      if (this.gen !== gen) return; // replaced child: ignore
      const msg = raw as HostMessage;
      if (msg.t === 'ready') {
        if (msg.protocol !== HOST_PROTOCOL_VERSION) {
          this.ready.reject(
            new Error(
              `engine host speaks protocol ${msg.protocol}, expected ${HOST_PROTOCOL_VERSION} — stale dist?`,
            ),
          );
          child.kill('SIGKILL');
          return;
        }
        clearTimeout(readyTimer);
        this.engineBuild = msg.engineBuild;
        this.state = 'ready';
        this.downSince = null;
        this.armHealthyReset();
        this.armInspectRefresh(gen);
        this.refreshInspect();
        this.ready.resolve();
        return;
      }
      if (msg.t === 'init-error') {
        clearTimeout(readyTimer);
        this.ready.reject(new Error(`engine host failed to initialize: ${msg.error}`));
        child.kill('SIGKILL');
        return;
      }
      this.onMessage(msg);
    });

    child.on('exit', (code, signal) => {
      if (this.gen !== gen) return; // an already-replaced child
      clearTimeout(readyTimer);
      this.onHostExit(code, signal);
    });
  }

  private onHostExit(code: number | null, signal: string | null): void {
    if (this.state === 'destroyed') return;
    this.child = null;
    this.state = 'backoff';
    if (this.downSince === null) this.downSince = Date.now();
    if (this.healthyTimer) clearTimeout(this.healthyTimer);
    if (this.inspectTimer) clearInterval(this.inspectTimer);

    // ROTATE FIRST: from this line on, every new dispatch parks on an
    // unresolved promise instead of sailing into a dead child.
    const failedReady = this.ready;
    this.ready = deferred<void>();
    // If the host died before ever becoming ready, settle the old ready's
    // waiters (create()/awaitReady) with the exit as the reason.
    failedReady.reject(
      new Error(`engine host exited before ready (code=${code} signal=${signal})`),
    );

    const suspects = [...this.inFlight.values()]
      .filter((p) => p.suspect !== null)
      .map((p) => p.suspect!);
    const err = unavailable(
      `engine host died (code=${code} signal=${signal}); the request can be retried`,
    );
    for (const pending of this.inFlight.values()) {
      pending.cleanupAbort();
      pending.reject(err);
    }
    this.inFlight.clear();
    this.residency.clear();
    this.lastInspect = [];

    // Journal first (needs the pre-clear suspect view), forget second,
    // respawn third. Journal/restart hooks must never block or throw
    // their way out of supervision.
    try {
      this.opts.onHostCrash?.({ suspects, code, signal, engineBuild: this.engineBuild });
    } catch {
      /* journaling must never prevent recovery */
    }
    try {
      this.opts.onHostRestart?.();
    } catch {
      /* ditto */
    }

    const delay = this.respawnDelayMs;
    this.respawnDelayMs = Math.min(this.respawnDelayMs * 2, this.opts.respawnMaxMs ?? 5_000);
    this.respawnTimer = setTimeout(() => this.spawn(), delay);
    this.respawnTimer.unref?.();
  }

  private armHealthyReset(): void {
    if (this.healthyTimer) clearTimeout(this.healthyTimer);
    this.healthyTimer = setTimeout(() => {
      this.respawnDelayMs = this.opts.respawnBaseMs ?? 250;
    }, this.opts.healthyResetMs ?? 60_000);
    this.healthyTimer.unref?.();
  }

  private armInspectRefresh(gen: number): void {
    this.inspectTimer = setInterval(() => {
      if (this.gen !== gen || this.state !== 'ready') return;
      this.refreshInspect();
    }, INSPECT_REFRESH_MS);
    this.inspectTimer.unref?.();
  }

  private refreshInspect(): void {
    void this.control({ t: 'inspect', callId: 0 }).catch(() => undefined);
  }

  /** One awaited inspect round-trip with a bound; failure is tolerable. */
  private async primeInspect(boundMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const bound = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, boundMs);
      timer.unref?.();
    });
    await Promise.race([
      this.control({ t: 'inspect', callId: 0 }).then(
        () => undefined,
        () => undefined,
      ),
      bound,
    ]);
    if (timer) clearTimeout(timer);
  }

  // ------------------------------------------------------------- messages

  private onMessage(msg: HostMessage): void {
    switch (msg.t) {
      case 'result':
        this.settle(msg.callId, (p) => p.resolve(msg.result));
        return;
      case 'control':
        if (msg.control.tag === 'inspect') this.lastInspect = msg.control.slots;
        this.settle(msg.callId, (p) => p.resolve(msg.control));
        return;
      case 'error':
        this.settle(msg.callId, (p) => p.reject(deserializeError(msg.error)));
        return;
      case 'evict':
        this.residency.delete(msg.docId);
        this.opts.onEvict?.({ docId: msg.docId, baseSha: msg.baseSha, slot: msg.slot });
        return;
      default:
        return;
    }
  }

  private settle(callId: number, fn: (p: PendingCall) => void): void {
    const pending = this.inFlight.get(callId);
    if (!pending) return;
    this.inFlight.delete(callId);
    pending.cleanupAbort();
    fn(pending);
  }

  // ------------------------------------------------------------- dispatch

  private async awaitReady(): Promise<void> {
    const deadlineMs = this.opts.dispatchDeadlineMs ?? 10_000;
    const deadlineAt = Date.now() + deadlineMs;
    for (;;) {
      if (this.state === 'destroyed') throw unavailable('pool destroyed');
      if (this.state === 'ready' && this.child) return;
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        throw unavailable('engine host is unavailable (respawn did not complete in time)');
      }
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), remaining);
        timer.unref?.();
      });
      const outcome = await Promise.race([
        this.ready.promise.then(
          () => 'ready' as const,
          () => 'retry' as const, // a failed spawn rotates ready again; loop
        ),
        timedOut,
      ]);
      if (timer) clearTimeout(timer);
      if (outcome === 'timeout') {
        throw unavailable('engine host is unavailable (respawn did not complete in time)');
      }
      // 'ready' or 'retry': loop re-checks state against the CURRENT world.
    }
  }

  private suspectFor(
    op: 'runOpen' | 'run' | 'runAdHoc',
    docId: string | undefined,
    baseSha: string | undefined,
    opKind: string,
  ): HostCrashSuspect {
    const sha =
      baseSha ?? (op === 'run' && docId !== undefined ? (this.residency.get(docId) ?? null) : null);
    return { baseSha: sha, docId: docId ?? null, opKind };
  }

  private async dispatch(
    op: 'runOpen' | 'run' | 'runAdHoc',
    docId: string | undefined,
    baseSha: string | undefined,
    build: BuildPack,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    if (this.state === 'destroyed') throw unavailable('pool destroyed');
    if (signal?.aborted) throw new AbortError(signal.reason);
    if (this.inFlight.size >= (this.opts.maxInFlight ?? 512)) {
      throw unavailable('engine host is saturated; retry shortly');
    }
    await this.awaitReady();
    const child = this.child;
    if (!child) throw unavailable('engine host is unavailable');
    if (signal?.aborted) throw new AbortError(signal.reason);

    const callId = this.nextCallId++;
    const payload = build(callId).payload;
    const opKind = (payload as { kind?: string }).kind ?? 'unknown';

    const result = await new Promise<WorkerResultPayload | HostControlResult>((resolve, reject) => {
      const onAbort = () => {
        this.send({ t: 'abort', callId });
      };
      const cleanupAbort = () => signal?.removeEventListener('abort', onAbort);
      this.inFlight.set(callId, {
        gen: this.gen,
        kind: 'work',
        resolve,
        reject,
        cleanupAbort,
        suspect: this.suspectFor(op, docId, baseSha, opKind),
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      child.send({ t: 'dispatch', callId, op, docId, baseSha, payload }, (err) => {
        if (err) {
          this.settle(callId, (p) =>
            p.reject(unavailable(`engine host IPC send failed: ${err.message}`)),
          );
        }
      });
    });
    return result as WorkerResultPayload;
  }

  private send(msg: HostRequest): void {
    this.child?.send(msg, () => undefined);
  }

  private control(msg: HostRequest): Promise<HostControlResult> {
    const child = this.child;
    if (!child || this.state !== 'ready') {
      return Promise.reject(unavailable('engine host is unavailable'));
    }
    const callId = this.nextCallId++;
    return new Promise<HostControlResult>((resolve, reject) => {
      this.inFlight.set(callId, {
        gen: this.gen,
        kind: 'control',
        resolve: (r) => resolve(r as HostControlResult),
        reject,
        cleanupAbort: () => undefined,
        suspect: null,
      });
      child.send({ ...msg, callId }, (err) => {
        if (err)
          this.settle(callId, (p) =>
            p.reject(unavailable(`engine host IPC send failed: ${err.message}`)),
          );
      });
    });
  }

  // ------------------------------------------------------- EnginePool API

  async runOpen(
    docId: string,
    baseShaOrBuild: string | BuildPack,
    buildOrSignal?: BuildPack | AbortSignal,
    maybeSignal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    let baseSha: string | undefined;
    let build: BuildPack;
    let signal: AbortSignal | undefined;
    if (typeof baseShaOrBuild === 'string') {
      baseSha = baseShaOrBuild;
      build = buildOrSignal as BuildPack;
      signal = maybeSignal;
    } else {
      build = baseShaOrBuild;
      signal = buildOrSignal as AbortSignal | undefined;
    }
    const result = await this.dispatch('runOpen', docId, baseSha, build, signal);
    if (baseSha !== undefined) this.residency.set(docId, baseSha);
    return result;
  }

  run(docId: string, build: BuildPack, signal?: AbortSignal): Promise<WorkerResultPayload> {
    return this.dispatch('run', docId, undefined, build, signal);
  }

  runAdHoc(
    baseSha: string | undefined,
    build: BuildPack,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    return this.dispatch('runAdHoc', undefined, baseSha, build, signal);
  }

  async close(docId: string): Promise<WorkerResultPayload | null> {
    this.residency.delete(docId);
    if (this.state !== 'ready' || !this.child) {
      // A dead/absent host has no session to close; mirror the pool's
      // "not open → null" contract instead of erroring the caller.
      return null;
    }
    try {
      const control = await this.control({ t: 'close', callId: 0, docId });
      return control.tag === 'closed' ? control.result : null;
    } catch {
      return null; // close is best-effort, exactly like pool eviction close
    }
  }

  async destroy(): Promise<void> {
    if (this.state === 'destroyed') return;
    this.state = 'destroyed';
    if (this.respawnTimer) clearTimeout(this.respawnTimer);
    if (this.healthyTimer) clearTimeout(this.healthyTimer);
    if (this.inspectTimer) clearInterval(this.inspectTimer);
    const child = this.child;
    this.child = null;
    const err = unavailable('pool destroyed');
    for (const pending of this.inFlight.values()) {
      pending.cleanupAbort();
      pending.reject(err);
    }
    this.inFlight.clear();
    this.residency.clear();
    if (child) {
      // Graceful shutdown with a hard bound, then SIGKILL.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, this.opts.shutdownTimeoutMs ?? 2_000);
        timer.unref?.();
        const callId = this.nextCallId++;
        child.on('message', (raw: unknown) => {
          const msg = raw as HostMessage;
          if (msg.t === 'control' && msg.callId === callId && msg.control.tag === 'shutdown') {
            clearTimeout(timer);
            resolve();
          }
        });
        child.send({ t: 'shutdown', callId }, (sendErr) => {
          if (sendErr) {
            clearTimeout(timer);
            child.kill('SIGKILL');
            resolve();
          }
        });
      });
    }
  }

  inspect(): Array<{ slot: number; docIds: string[]; baseShas: string[] }> {
    return this.lastInspect;
  }

  stats(): { slots: number; docs: number; inFlight: number } {
    let docs = 0;
    for (const s of this.lastInspect) docs += s.docIds.length;
    return { slots: this.lastInspect.length, docs, inFlight: this.inFlight.size };
  }

  generation(): number {
    return this.gen;
  }

  health(): { state: 'ready' | 'starting' | 'backoff'; downSinceMs: number | null } {
    const state = this.state === 'destroyed' ? 'backoff' : this.state;
    return {
      state,
      downSinceMs: this.downSince === null ? null : Date.now() - this.downSince,
    };
  }

  /** The live host pid (drills + boundary tests kill it directly). */
  hostPid(): number | null {
    return this.child?.pid ?? null;
  }
}

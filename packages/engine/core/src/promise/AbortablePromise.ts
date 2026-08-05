import { AbortError } from './AbortError';

export type AbortableExecutor<T, P> = (
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason: unknown) => void,
  progress: (p: P) => void,
  signal: AbortSignal,
) => void;

/**
 * Awaitable Promise subclass with abort and progress.
 *
 * Symbol.species returns plain Promise so chained .then/.catch/.finally
 * return regular promises and never try to synthesize a new
 * AbortablePromise (which would have no executor).
 *
 * Settlement contract:
 *   - The first settlement wins. resolve/reject handed to the executor
 *     are wrapped so that any subsequent call (whether by the executor,
 *     by abort(), or by both racing) becomes a silent no-op.
 *   - abort() rejects the public promise with AbortError immediately,
 *     even if the executor never observes the AbortSignal. The executor
 *     still receives the AbortSignal so it can stop real work
 *     cooperatively (release a queue slot, abort fetch, post a worker
 *     abort, etc.). Anything the executor does after that — including
 *     a late resolve(value), a late reject(error), or a rejected inner
 *     Promise inside AbortablePromise.run — is dropped silently.
 *   - abort() after settlement is a no-op.
 */
export class AbortablePromise<T, P = never> extends Promise<T> {
  static override get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  readonly signal: AbortSignal;

  private readonly _ctrl: AbortController;
  private readonly _progressCbs: Set<(p: P) => void>;
  private readonly _state: { settled: boolean };
  private readonly _internalReject: (reason: unknown) => void;

  constructor(executor: AbortableExecutor<T, P>) {
    const ctrl = new AbortController();
    const progressCbs = new Set<(p: P) => void>();
    const state = { settled: false };
    let capturedReject!: (reason: unknown) => void;

    super((resolve, reject) => {
      capturedReject = reject;

      const wrappedResolve = (value: T | PromiseLike<T>) => {
        if (state.settled) return;
        state.settled = true;
        resolve(value);
      };
      const wrappedReject = (reason: unknown) => {
        if (state.settled) return;
        state.settled = true;
        reject(reason);
      };
      const progress = (p: P) => {
        if (state.settled) return;
        for (const cb of progressCbs) {
          try {
            cb(p);
          } catch {
            // ignore subscriber errors
          }
        }
      };

      executor(wrappedResolve, wrappedReject, progress, ctrl.signal);
    });

    this._ctrl = ctrl;
    this.signal = ctrl.signal;
    this._progressCbs = progressCbs;
    this._state = state;
    this._internalReject = capturedReject;
  }

  /**
   * Abort the underlying operation.
   *
   * - If the promise has already settled, this is a no-op.
   * - Otherwise the public promise rejects synchronously with an
   *   AbortError (wrapping the supplied reason if it is not already an
   *   AbortError) and the AbortSignal fires for any cooperative
   *   cancellation the executor wired up.
   */
  abort(reason?: unknown): void {
    if (this._state.settled) return;
    if (this._ctrl.signal.aborted) return;

    const err = reason instanceof AbortError ? reason : new AbortError(reason);

    // Mark settled before signalling so any abort listener the executor
    // attached cannot race a late resolve/reject through the wrapped
    // settlers (they all consult state.settled).
    this._state.settled = true;
    this._ctrl.abort(err);
    this._internalReject(err);
  }

  /**
   * Subscribe to progress events. Returns an unsubscribe function.
   */
  onProgress(cb: (p: P) => void): () => void {
    this._progressCbs.add(cb);
    return () => {
      this._progressCbs.delete(cb);
    };
  }

  /**
   * Wrap a value in an already-resolved AbortablePromise. Mirrors Promise.resolve.
   */
  static resolveValue<T>(value: T | PromiseLike<T>): AbortablePromise<T> {
    return new AbortablePromise<T>((resolve) => resolve(value));
  }

  /**
   * Wrap a thrown reason in an already-rejected AbortablePromise.
   */
  static rejectReason<T = never>(reason: unknown): AbortablePromise<T> {
    return new AbortablePromise<T>((_resolve, reject) => reject(reason));
  }

  /**
   * Run an async function as an AbortablePromise so callers get .abort() and .signal.
   * The async function receives the AbortSignal (and a progress emitter) so it can
   * cooperate with the abort.
   *
   * If abort() fires while the inner async function is still running, the
   * public promise rejects with AbortError immediately. The inner async
   * function's eventual settlement (resolve or reject) is funneled through
   * the wrapped settlers and silently dropped — including a late rejection
   * from the underlying work, which prevents an UnhandledRejection because
   * the .then(resolve, reject) below "handles" it via the no-op.
   */
  static run<T, P = never>(
    fn: (signal: AbortSignal, progress: (p: P) => void) => Promise<T>,
  ): AbortablePromise<T, P> {
    return new AbortablePromise<T, P>((resolve, reject, progress, signal) => {
      fn(signal, progress).then(resolve, reject);
    });
  }
}

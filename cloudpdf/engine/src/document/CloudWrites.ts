import { AbortError, EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

import type { CloudObjectNumberPool } from './CloudObjectNumberPool';
import type { RequestOptions } from '../transport/HttpClient';

/**
 * One write's place in its document's line (see {@link CloudWrites}): its
 * request goes out once every write called before it has settled.
 */
export interface CloudWrite {
  /**
   * Wait for this write's turn, then send its request with `options`: the
   * write's `opId` as `Idempotency-Key`, a top-up when the pool runs low,
   * and the numbers the response hands out back into the pool.
   */
  send<T>(request: (options: RequestOptions) => Promise<T>): Promise<T>;
}

/**
 * A document's writes, sent one at a time in the order they were called,
 * so the server applies them in that order: a create, then an update of
 * what it made, never the other way round. Reads don't wait.
 *
 * A write takes its place when it is called: `run` must be the first thing
 * a write does, before anything it awaits. What it does before `send`
 * (reading a file to upload, say) happens meanwhile; its turn ends when it
 * settles, after the event it publishes.
 */
export class CloudWrites {
  /** Settles when every write so far has settled. */
  private last: Promise<void> = Promise.resolve();

  constructor(private readonly pool: CloudObjectNumberPool) {}

  run<T>(
    opId: string,
    signal: AbortSignal,
    body: (write: CloudWrite) => Promise<T>,
    /** The object numbers the write creates objects at. */
    named: readonly (number | undefined)[] = [],
  ): Promise<T> {
    const before = this.last;
    const numbers = named.filter((n): n is number => n !== undefined);
    this.pool.beginWrite(numbers);
    const write: CloudWrite = {
      send: async (request) => {
        await untilTurn(before, signal);
        const reserve = this.pool.topUp();
        return request({
          write: {
            opId,
            ...(reserve > 0 ? { reserveObjectNumbers: reserve } : {}),
            onObjectNumbers: (ranges) => this.pool.receive(ranges),
          },
        });
      },
    };
    const settled = body(write).then(
      (result) => {
        this.pool.endWrite(numbers, 'committed');
        return result;
      },
      (error: unknown) => {
        this.pool.endWrite(
          numbers,
          EngineError.is(error, EngineErrorCode.ObjectNumberUnavailable) ? 'refused' : 'failed',
        );
        throw error;
      },
    );
    // The next write waits for this one and, should this one end early (an
    // abort), still for every write before it.
    this.last = before.then(() => settled.then(noop, noop));
    return settled;
  }
}

function noop(): void {}

/** `before`, or an `AbortError` once `signal` aborts. */
function untilTurn(before: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new AbortError(signal.reason ?? 'aborted'));
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(new AbortError(signal.reason ?? 'aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    void before.then(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}

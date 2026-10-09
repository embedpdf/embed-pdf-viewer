import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  objectNumbersIn,
  wirePack,
  type DocumentEventStream,
  type ObjectNumberPool,
  type ObjectNumberRange,
  type ObjectNumbersLost,
} from '@embedpdf/engine-core/runtime';

import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

/** How many numbers the pool keeps: it gets them as the document opens, and tops up to it. */
export const OBJECT_NUMBER_POOL_SIZE = 64;

/** Below this many, the pool asks for more in the background. */
const REFILL_BELOW = 32;

/**
 * The local engine's reserved object numbers. The worker hands them out
 * (`objectNumbers.reserve`): it raises the layer's last object number past
 * them and keeps them as this session's, refusing a create that names any
 * other. This pool keeps the ones not taken yet, in order, and asks for
 * more in the background when fewer than half are left.
 *
 * A new version (a completed signing) numbers objects anew: the worker drops
 * what the session held, and so does the pool, telling `onLost` listeners.
 */
export class LocalObjectNumberPool implements ObjectNumberPool {
  private numbers: number[] = [];
  private refilling = false;
  private readonly lostListeners = new Set<(lost: ObjectNumbersLost) => void>();

  constructor(
    private readonly docId: string,
    private readonly queue: JobQueue,
    events: DocumentEventStream,
    first?: ObjectNumberRange,
  ) {
    if (first) this.numbers = objectNumbersIn([first]);
    events.on('document.versioned', () => {
      const numbers = this.numbers;
      this.numbers = [];
      if (numbers.length > 0) this.notifyLost({ numbers, reason: 'versioned' });
      this.topUp();
    });
  }

  get held(): number {
    return this.numbers.length;
  }

  take(): number | null {
    const number = this.numbers.shift() ?? null;
    if (this.numbers.length < REFILL_BELOW) this.topUp();
    return number;
  }

  reserve(count: number): AbortablePromise<void> {
    if (!Number.isInteger(count) || count < 1) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.InvalidArg, `cannot reserve ${count} object numbers`, {
          details: { field: 'count' },
        }),
      );
    }
    if (this.numbers.length >= count) return AbortablePromise.resolveValue(undefined);
    const request = this.request(count - this.numbers.length);
    return AbortablePromise.run<void>(async (signal) => {
      const onAbort = () => request.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      this.add(await request);
    });
  }

  onLost(listener: (lost: ObjectNumbersLost) => void): () => void {
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }

  /**
   * Fill the pool to its size in the background, once at a time. A refusal
   * (a closed document, a full one) leaves it as it is: `take` then returns
   * `null`, and `reserve` reports why.
   */
  topUp(): void {
    if (this.refilling || this.numbers.length >= OBJECT_NUMBER_POOL_SIZE) return;
    this.refilling = true;
    this.request(OBJECT_NUMBER_POOL_SIZE - this.numbers.length).then(
      (range) => {
        this.refilling = false;
        this.add(range);
      },
      () => {
        this.refilling = false;
      },
    );
  }

  private add(range: ObjectNumberRange): void {
    this.numbers.push(...objectNumbersIn([range]));
  }

  private request(count: number): AbortablePromise<ObjectNumberRange> {
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'objectNumbers.reserve', effect: 'session', jobId, docId, count }),
    });
    return AbortablePromise.run<ObjectNumberRange>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'objectNumbers.reserve') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.range;
    });
  }

  private notifyLost(lost: ObjectNumbersLost): void {
    for (const listener of [...this.lostListeners]) {
      try {
        listener(lost);
      } catch {
        // A throwing listener never stops the others.
      }
    }
  }
}

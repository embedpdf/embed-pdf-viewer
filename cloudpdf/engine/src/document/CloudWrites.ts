import {
  AbortError,
  EngineError,
  EngineErrorCode,
  type Change,
  type ChangeAnswer,
  type PageCoordinates,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import { CHANGE_REQUEST_LIMITS } from '@embedpdf/engine-core/wire';

import type { CloudObjectNumberPool, WriteOutcome } from './CloudObjectNumberPool';
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

/** A change as its request sends it: its `opId`, and its ops with the bytes they carry. */
export interface SentChange {
  readonly opId: string;
  readonly change: Change<PageCoordinates, WireAnnotationResources>;
}

/**
 * Sends one request of changes (`POST …/changes`) with `options`, the
 * changes in line order, and answers each, in the same order.
 */
export type ChangeSender = (
  changes: readonly SentChange[],
  options: RequestOptions,
) => Promise<readonly ChangeAnswer[]>;

/** How a change takes its place in the line (see {@link CloudWrites.change}). */
export interface LinedChangeOptions {
  /** The object numbers the change creates objects at. */
  readonly named?: readonly number[];
  /**
   * The change carries bytes: it goes in a request of its own, so bytes the
   * server refuses refuse only this change.
   */
  readonly alone?: boolean;
}

/** A change waiting for its request. */
interface LinedChange {
  readonly ready: Promise<SentChange>;
  readonly signal: AbortSignal;
  readonly numbers: readonly number[];
  readonly resolve: (answer: ChangeAnswer) => void;
  readonly reject: (error: unknown) => void;
}

/** Changes that go out in one request, once it's their turn. */
interface Batch {
  readonly changes: LinedChange[];
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
 *
 * Changes (`doc.apply`) called one after another share a place: while the
 * write before them is in flight they wait together, and go out as one
 * request when their turn comes, each answered on its own.
 */
export class CloudWrites {
  /** Settles when every write so far has settled. */
  private last: Promise<void> = Promise.resolve();
  /** The changes still waiting for their turn, which the next change joins. */
  private open: Batch | null = null;

  constructor(
    private readonly pool: CloudObjectNumberPool,
    private readonly sendChanges: ChangeSender = () => {
      throw new EngineError(EngineErrorCode.NotImplemented, 'this line sends no changes');
    },
  ) {}

  run<T>(
    opId: string,
    signal: AbortSignal,
    body: (write: CloudWrite) => Promise<T>,
    /** The object numbers the write creates objects at. */
    named: readonly (number | undefined)[] = [],
  ): Promise<T> {
    // A change called after this write goes after it.
    this.open = null;
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
        this.pool.endWrite(numbers, outcomeOf(error));
        throw error;
      },
    );
    // The next write waits for this one and, should this one end early (an
    // abort), still for every write before it.
    this.last = before.then(() => settled.then(noop, noop));
    return settled;
  }

  /**
   * Take a change's place in the line: it joins the changes waiting for
   * their turn, and goes out with them. `ready` is what the request sends
   * for it, which it may still be preparing (reading bytes). A change aborted
   * before its request goes out is left out of it; once out, it is answered.
   */
  change(
    signal: AbortSignal,
    ready: Promise<SentChange>,
    { named = [], alone = false }: LinedChangeOptions = {},
  ): Promise<ChangeAnswer> {
    this.pool.beginWrite(named);
    // A change that fails to get ready is told so on its turn; until then its
    // failure is expected, not unhandled.
    ready.catch(noop);
    const answer = new Promise<ChangeAnswer>((resolve, reject) => {
      const lined: LinedChange = { ready, signal, numbers: named, resolve, reject };
      const joinable =
        !alone && this.open !== null && this.open.changes.length < CHANGE_REQUEST_LIMITS.changes;
      const batch = joinable ? this.open! : this.queue();
      batch.changes.push(lined);
      if (alone) this.open = null;
    });
    return answer.then(
      (settled) => {
        this.pool.endWrite(named, settledOutcomeOf(settled));
        return settled;
      },
      (error: unknown) => {
        this.pool.endWrite(named, outcomeOf(error));
        throw error;
      },
    );
  }

  /** A new batch at the end of the line, open for the changes that follow. */
  private queue(): Batch {
    const before = this.last;
    const batch: Batch = { changes: [] };
    this.open = batch;
    const sent = before.then(() => this.send(batch));
    this.last = sent.then(noop, noop);
    return batch;
  }

  /** A batch's turn: nothing joins it any more, and what's ready goes out. */
  private async send(batch: Batch): Promise<void> {
    if (this.open === batch) this.open = null;
    const prepared = await Promise.allSettled(batch.changes.map((lined) => lined.ready));
    const going: { lined: LinedChange; sent: SentChange }[] = [];
    batch.changes.forEach((lined, index) => {
      const ready = prepared[index]!;
      if (lined.signal.aborted) lined.reject(new AbortError(lined.signal.reason ?? 'aborted'));
      else if (ready.status === 'rejected') lined.reject(ready.reason);
      else going.push({ lined, sent: ready.value });
    });
    if (going.length === 0) return;
    const reserve = this.pool.topUp();
    try {
      const answers = await this.sendChanges(
        going.map(({ sent }) => sent),
        {
          write: {
            ...(reserve > 0 ? { reserveObjectNumbers: reserve } : {}),
            onObjectNumbers: (ranges) => this.pool.receive(ranges),
          },
        },
      );
      if (answers.length !== going.length) {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `${going.length} changes sent, ${answers.length} answered`,
        );
      }
      going.forEach(({ lined }, index) => lined.resolve(answers[index]!));
    } catch (error) {
      for (const { lined } of going) lined.reject(error);
    }
  }
}

function noop(): void {}

/** What a write that failed with `error` did with the numbers it named. */
function outcomeOf(error: unknown): 'refused' | 'failed' {
  return EngineError.is(error, EngineErrorCode.ObjectNumberUnavailable) ? 'refused' : 'failed';
}

/** What an answered change did with the numbers it named, as a single write's outcome. */
function settledOutcomeOf(answer: ChangeAnswer): WriteOutcome {
  if (answer.status === 'applied') return 'committed';
  return answer.error.code === EngineErrorCode.ObjectNumberUnavailable ? 'refused' : 'failed';
}

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

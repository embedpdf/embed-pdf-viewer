import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type ObjectNumberPool,
  type ObjectNumbersLost,
} from '@embedpdf/engine-core/runtime';

/**
 * The cloud engine's object number pool. The server hands each editing
 * session its numbers; this server hands out none yet, so the pool holds
 * none: `take` returns `null`, a create without a number works as before,
 * and one naming a number is refused `not-held` before anything is sent.
 */
export class CloudObjectNumberPool implements ObjectNumberPool {
  readonly held = 0;

  take(): number | null {
    return null;
  }

  reserve(_count: number): AbortablePromise<void> {
    return AbortablePromise.rejectReason(
      new EngineError(EngineErrorCode.NotImplemented, 'this server hands out no object numbers'),
    );
  }

  onLost(_listener: (lost: ObjectNumbersLost) => void): () => void {
    return () => {};
  }
}

/** Refuses a create that names object numbers: this session holds none (see the pool). */
export function assertNoObjectNumber(...numbers: readonly (number | undefined)[]): void {
  for (const objectNumber of numbers) {
    if (objectNumber === undefined) continue;
    throw new EngineError(
      EngineErrorCode.ObjectNumberUnavailable,
      `object number ${objectNumber} isn't one this session holds`,
      { details: { objectNumber, reason: 'not-held' } },
    );
  }
}

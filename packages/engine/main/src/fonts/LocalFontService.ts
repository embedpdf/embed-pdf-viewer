import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type FontHandle,
  type FontKey,
  type FontService,
  type FontSpec,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

import { Priority } from '../worker/Priority';
import type { JobId } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface RegisteredFont {
  handle: FontHandle;
  /** Encoded `italic` wire value (-1 infer / 0 / 1) for replay. */
  italic: number;
  weight: number;
  familyName: string;
  /**
   * A private copy of the bytes, kept for replay onto a respawned worker. The
   * copy is essential: the buffer we send is transferred (neutered) zero-copy,
   * so we cannot reuse it.
   */
  bytes: ArrayBuffer;
}

/**
 * Main-thread implementation of {@link FontService} for the local engine.
 *
 * It is the authoritative store of registered fonts; the worker holds only the
 * derived `fontKey → native FontId` map. Registration broadcasts to the worker
 * over the same {@link WorkerQueue} as every other operation, so a font is
 * always registered before any annotation create/update that references it can
 * run (the queue serializes through one host).
 *
 * Keeping the bytes here also lets us {@link replay} the full registry, in
 * order, onto a freshly spawned worker — which is what keeps `fontKey`s stable
 * across a worker restart (and would extend to a worker pool): each worker
 * re-derives the same ids from the same registration order.
 */
export class LocalFontService implements FontService {
  private readonly fonts = new Map<FontKey, RegisteredFont>();
  private readonly fallbacks: FontKey[] = [];

  constructor(private readonly queue: WorkerQueue) {}

  register(spec: FontSpec): AbortablePromise<FontHandle> {
    const bytes = toArrayBuffer(spec.data);
    const key = spec.key;

    const existing = this.fonts.get(key);
    if (existing) {
      // Idempotent: re-registering the same key is a no-op (no re-upload).
      return AbortablePromise.resolveValue(existing.handle);
    }

    const familyName = spec.familyName ?? '';
    const weight = spec.weight ?? 0;
    const italic = spec.italic === undefined ? -1 : spec.italic ? 1 : 0;
    const handle: FontHandle = {
      key,
      familyName,
      weight,
      italic: spec.italic ?? false,
    };

    return AbortablePromise.run<FontHandle>(async (signal) => {
      // Copy for replay BEFORE the transfer neuters `bytes`.
      const replayCopy = bytes.slice(0);
      const submission = this.queue.enqueue<
        Extract<WorkerResultPayload, { tag: 'fonts.register' }>
      >(
        {
          buildPack: (jobId: JobId) =>
            wirePack(
              {
                kind: 'fonts.register',
                jobId,
                fontKey: key,
                familyName,
                weight,
                italic,
                data: bytes,
              },
              [bytes],
            ),
        },
        { priority: Priority.HIGH },
      );
      forwardAbort(signal, submission);
      await submission;
      this.fonts.set(key, { handle, italic, weight, familyName, bytes: replayCopy });
      return handle;
    });
  }

  registerAll(specs: FontSpec[]): AbortablePromise<FontHandle[]> {
    return AbortablePromise.run<FontHandle[]>(async (signal) => {
      const handles: FontHandle[] = [];
      for (const spec of specs) {
        const submission = this.register(spec);
        forwardAbort(signal, submission);
        handles.push(await submission);
      }
      return handles;
    });
  }

  addFallback(font: FontHandle | FontKey): AbortablePromise<void> {
    const key = typeof font === 'string' ? font : font.key;
    if (!this.fonts.has(key)) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.InvalidArg, `font not registered: ${key}`),
      );
    }
    return AbortablePromise.run<void>(async (signal) => {
      const submission = this.queue.enqueue({
        buildPack: (jobId: JobId) => wirePack({ kind: 'fonts.addFallback', jobId, fontKey: key }),
      });
      forwardAbort(signal, submission);
      await submission;
      if (!this.fallbacks.includes(key)) this.fallbacks.push(key);
    });
  }

  clearFallbacks(): AbortablePromise<void> {
    return AbortablePromise.run<void>(async (signal) => {
      const submission = this.queue.enqueue({
        buildPack: (jobId: JobId) => wirePack({ kind: 'fonts.clearFallbacks', jobId }),
      });
      forwardAbort(signal, submission);
      await submission;
      this.fallbacks.length = 0;
    });
  }

  clear(): AbortablePromise<void> {
    return AbortablePromise.run<void>(async (signal) => {
      const submission = this.queue.enqueue({
        buildPack: (jobId: JobId) => wirePack({ kind: 'fonts.clear', jobId }),
      });
      forwardAbort(signal, submission);
      await submission;
      this.fonts.clear();
      this.fallbacks.length = 0;
    });
  }

  list(): readonly FontHandle[] {
    return [...this.fonts.values()].map((f) => f.handle);
  }

  /**
   * Re-issue the entire registry to a freshly (re)spawned worker, in original
   * order, so `fontKey → id` rebinds deterministically. Not yet called by the
   * single-worker engine, but the contract a worker pool / crash-recovery path
   * would use. Sends fresh copies so the retained bytes are never neutered.
   */
  async replay(): Promise<void> {
    for (const [key, font] of this.fonts) {
      const copy = font.bytes.slice(0);
      await this.queue.enqueue({
        buildPack: (jobId: JobId) =>
          wirePack(
            {
              kind: 'fonts.register',
              jobId,
              fontKey: key,
              familyName: font.familyName,
              weight: font.weight,
              italic: font.italic,
              data: copy,
            },
            [copy],
          ),
      });
    }
    for (const key of this.fallbacks) {
      await this.queue.enqueue({
        buildPack: (jobId: JobId) => wirePack({ kind: 'fonts.addFallback', jobId, fontKey: key }),
      });
    }
  }
}

function forwardAbort(signal: AbortSignal, submission: AbortablePromise<unknown>): void {
  const onAbort = () => submission.abort(signal.reason);
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
}

function toArrayBuffer(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input.slice(0);
  // Copy to a standalone ArrayBuffer so transferring it can't disturb an
  // unrelated SharedArrayBuffer or a larger view the caller still holds.
  const copy = new ArrayBuffer(input.byteLength);
  new Uint8Array(copy).set(input);
  return copy;
}

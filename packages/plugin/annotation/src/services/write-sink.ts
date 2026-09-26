import { PluginError, toPluginError, toPluginErrorInfo, type BatchResult } from '@embedpdf/core';
import type { Effect, Id } from '@embedpdf/core-annotation';
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';

/** One engine write a message's effects started, for the verb that awaits it. */
export interface WriteRecord {
  ref: AnnotationRef | null;
  promise: Promise<unknown>;
}

/**
 * Awaitable writes. The effects a message produces perform their engine
 * calls synchronously inside `commit`; a verb collects them here and settles
 * on all of them. Programmatic creates register a pending promise by their
 * optimistic id and resolve when the engine confirms.
 */
export function createWriteSink() {
  let sink: WriteRecord[] | null = null;
  /** Programmatic creates awaiting their engine confirmation, by optimistic id. */
  const pendingCreates = new Map<
    Id,
    { resolve(ref: AnnotationRef): void; reject(error: unknown): void }
  >();

  const note = (ref: AnnotationRef | null, promise: Promise<unknown>): void => {
    sink?.push({ ref, promise });
  };
  function collect<T>(run: () => T): { result: T; writes: WriteRecord[] } {
    const outer = sink;
    const writes: WriteRecord[] = [];
    sink = writes;
    try {
      return { result: run(), writes };
    } finally {
      sink = outer;
    }
  }
  const settle = async (
    refs: readonly AnnotationRef[],
    writes: readonly WriteRecord[],
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>> => {
    const settled = await Promise.allSettled(writes.map((w) => w.promise));
    const failed: { ref: AnnotationRef; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
    const failedKeys = new Set<string>();
    settled.forEach((r, i) => {
      const ref = writes[i]?.ref;
      if (r.status === 'rejected' && ref && !failedKeys.has(annotationKey(ref))) {
        failedKeys.add(annotationKey(ref));
        failed.push({ ref, error: toPluginErrorInfo(toPluginError('annotation', r.reason)) });
      }
    });
    return { applied: refs.filter((r) => !failedKeys.has(annotationKey(r))), skipped: [], failed };
  };
  const awaitAll = async (writes: readonly WriteRecord[]): Promise<void> => {
    const settled = await Promise.allSettled(writes.map((w) => w.promise));
    const first = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (first) throw toPluginError('annotation', first.reason);
  };

  /** Resolve once the optimistic entry with this id is confirmed by the engine. */
  const awaitCreate = (id: Id | undefined): Promise<AnnotationRef> =>
    new Promise<AnnotationRef>((resolve, reject) => {
      if (!id) {
        reject(
          new PluginError('operation-failed', 'annotation', 'the annotation could not be staged'),
        );
        return;
      }
      pendingCreates.set(id, {
        resolve,
        reject: (error) => reject(toPluginError('annotation', error)),
      });
    });
  const isCreateAwaited = (id: Id): boolean => pendingCreates.has(id);
  const confirmCreate = (id: Id, ref: AnnotationRef): void => {
    pendingCreates.get(id)?.resolve(ref);
    pendingCreates.delete(id);
  };
  const failCreate = (id: Id, error: unknown): void => {
    pendingCreates.get(id)?.reject(error);
    pendingCreates.delete(id);
  };

  const createEffectsOf = (effects: readonly Effect[]) =>
    effects.filter((e): e is Extract<Effect, { fx: 'create' }> => e.fx === 'create');
  const groupEffectsOf = (effects: readonly Effect[]) =>
    effects.filter((e): e is Extract<Effect, { fx: 'createGroup' }> => e.fx === 'createGroup');

  /** Run a verb per ref, in order, folding refusals into a BatchResult. */
  const batchOver = async <R>(
    refs: readonly R[],
    run: (ref: R) => Promise<AnnotationRef | void>,
    refOf: (ref: R, out: AnnotationRef | void) => AnnotationRef | null,
  ): Promise<BatchResult<AnnotationRef, R>> => {
    const applied: AnnotationRef[] = [];
    const failed: { ref: R; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
    for (const ref of refs) {
      try {
        const out = await run(ref);
        const r = refOf(ref, out);
        if (r) applied.push(r);
      } catch (error) {
        failed.push({ ref, error: toPluginErrorInfo(toPluginError('annotation', error)) });
      }
    }
    return { applied, skipped: [], failed };
  };

  return {
    note,
    collect,
    settle,
    awaitAll,
    awaitCreate,
    isCreateAwaited,
    confirmCreate,
    failCreate,
    createEffectsOf,
    groupEffectsOf,
    batchOver,
  };
}

export type WriteSink = ReturnType<typeof createWriteSink>;

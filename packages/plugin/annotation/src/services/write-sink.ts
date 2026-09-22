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
  /** Optimistic creates in flight, by the /NM their draft carries → temporary id. */
  const createsByName = new Map<string, Id>();
  /** Text writes in flight per annotation key: while one runs, the typed text is newer than its echo. */
  const textWrites = new Map<Id, number>();

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
    const settled = await Promise.allSettled(writes.map((write) => write.promise));
    const failed: { ref: AnnotationRef; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
    const failedKeys = new Set<string>();
    settled.forEach((outcome, i) => {
      const ref = writes[i]?.ref;
      if (outcome.status === 'rejected' && ref && !failedKeys.has(annotationKey(ref))) {
        failedKeys.add(annotationKey(ref));
        failed.push({ ref, error: toPluginErrorInfo(toPluginError('annotation', outcome.reason)) });
      }
    });
    return {
      applied: refs.filter((ref) => !failedKeys.has(annotationKey(ref))),
      skipped: [],
      failed,
    };
  };
  const awaitAll = async (writes: readonly WriteRecord[]): Promise<void> => {
    const settled = await Promise.allSettled(writes.map((write) => write.promise));
    const first = settled.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
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
  /** Track a text write for `key` until `write` settles. */
  const trackTextWrite = (key: Id, write: Promise<unknown>): void => {
    textWrites.set(key, (textWrites.get(key) ?? 0) + 1);
    const settle = () => {
      const remaining = (textWrites.get(key) ?? 1) - 1;
      if (remaining > 0) textWrites.set(key, remaining);
      else textWrites.delete(key);
    };
    write.then(settle, settle);
  };
  const hasTextWrite = (key: Id): boolean => textWrites.has(key);

  /** Remember that the create carrying `nm` stages the temporary record `tempId`. */
  const expectCreate = (nm: string, tempId: Id): void => {
    createsByName.set(nm, tempId);
  };
  /** The temporary record a confirmed create with this /NM replaces, once. */
  const claimCreate = (nm: string): Id | undefined => {
    const tempId = createsByName.get(nm);
    createsByName.delete(nm);
    return tempId;
  };
  const confirmCreate = (id: Id, ref: AnnotationRef): void => {
    pendingCreates.get(id)?.resolve(ref);
    pendingCreates.delete(id);
  };
  const failCreate = (id: Id, error: unknown): void => {
    pendingCreates.get(id)?.reject(error);
    pendingCreates.delete(id);
  };

  const createEffectsOf = (effects: readonly Effect[]) =>
    effects.filter(
      (effect): effect is Extract<Effect, { type: 'create' }> => effect.type === 'create',
    );
  const groupEffectsOf = (effects: readonly Effect[]) =>
    effects.filter(
      (effect): effect is Extract<Effect, { type: 'createGroup' }> => effect.type === 'createGroup',
    );

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
        const resolved = refOf(ref, out);
        if (resolved) applied.push(resolved);
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
    trackTextWrite,
    hasTextWrite,
    expectCreate,
    claimCreate,
    confirmCreate,
    failCreate,
    createEffectsOf,
    groupEffectsOf,
    batchOver,
  };
}

export type WriteSink = ReturnType<typeof createWriteSink>;

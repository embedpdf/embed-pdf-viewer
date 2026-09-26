/**
 * What a verb returns once its engine writes settled: a `BatchResult` over the
 * annotations it addressed, the ref of the record it created, or the first
 * refusal as an error.
 */
import { PluginError, toPluginError, toPluginErrorInfo, type BatchResult } from '@embedpdf/core';
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';

import type { IntentOutcome } from '../services/intents';
import type { Commit } from '../services/store';

/** The outcome over the refs a selection verb addressed: each applied, or failed with the refusal. */
export function batchResultOf(
  refs: readonly AnnotationRef[],
  outcome: IntentOutcome,
): BatchResult<AnnotationRef, AnnotationRef> {
  const errors = new Map<string, PluginError>();
  for (const { ids, error } of outcome.failed) for (const id of ids) errors.set(id, error);
  const failed = refs.flatMap((ref) => {
    const error = errors.get(annotationKey(ref));
    return error ? [{ ref, error: toPluginErrorInfo(error) }] : [];
  });
  return {
    applied: refs.filter((ref) => !errors.has(annotationKey(ref))),
    skipped: [],
    failed,
  };
}

/** Reject with the first refusal, for verbs whose promise fails when a write does. */
export function throwIfFailed(outcome: IntentOutcome): void {
  const [first] = outcome.failed;
  if (first) throw first.error;
}

/** The ref of the record a create message made, once the engine confirmed it. */
export async function createdRefOf(commit: Commit): Promise<AnnotationRef> {
  const effect = commit.effects.find(
    (candidate) => candidate.type === 'create' || candidate.type === 'createGroup',
  );
  const id =
    effect?.type === 'create' ? effect.id : effect?.type === 'createGroup' ? effect.primary : null;
  const outcome = await commit.written;
  throwIfFailed(outcome);
  const ref = id === null ? undefined : outcome.created[id];
  if (!ref) {
    throw new PluginError('operation-failed', 'annotation', 'the annotation could not be created');
  }
  return ref;
}

/** Run a verb per item, in order, folding refusals into a `BatchResult`. */
export async function batchOver<Item>(
  items: readonly Item[],
  run: (item: Item) => Promise<AnnotationRef | void>,
  refOf: (item: Item, out: AnnotationRef | void) => AnnotationRef | null,
): Promise<BatchResult<AnnotationRef, Item>> {
  const applied: AnnotationRef[] = [];
  const failed: { ref: Item; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
  for (const item of items) {
    try {
      const out = await run(item);
      const resolved = refOf(item, out);
      if (resolved) applied.push(resolved);
    } catch (error) {
      failed.push({ ref: item, error: toPluginErrorInfo(toPluginError('annotation', error)) });
    }
  }
  return { applied, skipped: [], failed };
}

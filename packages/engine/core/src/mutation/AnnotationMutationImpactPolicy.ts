import type { WeakAnnotationState } from '../revision/WeakAnnotationState';

export type AnnotationMutationKind = 'create' | 'update' | 'delete' | 'move';

export function changesAnnotationList(_kind: AnnotationMutationKind): boolean {
  return true;
}

export function shiftsExistingAnnotationIndices(kind: AnnotationMutationKind): boolean {
  return kind === 'delete' || kind === 'move';
}

export function invalidatesWeakIndexRefs(
  kind: AnnotationMutationKind,
  weakStateBefore: WeakAnnotationState,
): boolean {
  if (!shiftsExistingAnnotationIndices(kind)) {
    return false;
  }
  if (weakStateBefore.kind !== 'known') {
    throw new Error(
      `invalidatesWeakIndexRefs requires a known WeakAnnotationState for ${kind}; got 'unknown'. ` +
        'Caller must scan the page before computing mutation impact.',
    );
  }
  return weakStateBefore.hasAnyWeakAnnotations;
}

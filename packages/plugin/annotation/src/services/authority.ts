import { annotDeletable, annotTransformable } from '@embedpdf/core-annotation';
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from './context';
import type { AnnotationStore } from './store';

/**
 * Authorization: the engine's own collab resolver, mirrored. `canCreate` asks
 * about the caller's own identity; the mutation checks ask about the target's
 * stamped owner, built from the record's EMBD metadata. An unstamped record
 * yields `{}`, which any narrowed grant denies — matching the engine, so a
 * control gated here never disagrees with the write's outcome.
 */
export function createAuthority(
  ctx: Pick<AnnotationContext, 'doc' | 'allows'>,
  store: AnnotationStore,
) {
  const canRead = (): boolean => ctx.allows('doc.annotate.read');
  // What `ctx.assertAllowed('annotations:create', …)` refuses on, so the twin and the verbs agree.
  const canCreate = (): boolean => ctx.allows('annotations:create');

  const mutationTarget = (ref: AnnotationRef): { userId?: string; groupId?: string } => {
    const dto = store.model().byId[annotationKey(ref)]?.annotation;
    return {
      ...(dto?.userId != null ? { userId: dto.userId } : {}),
      ...(dto?.groupId != null ? { groupId: dto.groupId } : {}),
    };
  };
  const allowsMutation = (action: 'update' | 'delete', ref: AnnotationRef): boolean =>
    ctx.doc?.security.allowsAnnotation(action, mutationTarget(ref)) ?? false;

  // The twins answer "would the verb succeed?" — authority and flags, via
  // the same fused predicates the gestures and chrome consume, so a false
  // twin and a bare-outline render can never disagree (permissions.md).
  const canUpdate = (ref: AnnotationRef): boolean => {
    const record = store.model().byId[annotationKey(ref)];
    return !!record && annotTransformable(record);
  };
  const canDelete = (ref: AnnotationRef): boolean => {
    const record = store.model().byId[annotationKey(ref)];
    return !!record && annotDeletable(record);
  };

  return { canRead, canCreate, canUpdate, canDelete, allowsMutation };
}

export type Authority = ReturnType<typeof createAuthority>;

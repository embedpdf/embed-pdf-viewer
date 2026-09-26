import { PluginError, pageRefsEqual } from '@embedpdf/core';
import { annotDeletable, annotTransformable } from '@embedpdf/core-annotation';
import { annotationKey, type AnnotationRef, type PageRef } from '@embedpdf/engine-core/runtime';

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
  ctx: Pick<AnnotationContext, 'doc' | 'document'>,
  store: AnnotationStore,
) {
  const canRead = (): boolean => ctx.doc?.security.allows('doc.annotate.read') ?? true;
  const canCreate = (): boolean => ctx.doc?.security.allowsAnnotation('create') ?? false;

  const mutationTarget = (ref: AnnotationRef): { userId?: string; groupId?: string } => {
    const dto = store.model().byId[annotationKey(ref)]?.data;
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
  const canEdit = (ref: AnnotationRef): boolean => {
    const annotation = store.model().byId[annotationKey(ref)];
    return !!annotation && annotTransformable(annotation);
  };
  const canDelete = (ref: AnnotationRef): boolean => {
    const annotation = store.model().byId[annotationKey(ref)];
    return !!annotation && annotDeletable(annotation);
  };

  const assertCreate = (): void => {
    if (!canCreate()) {
      throw new PluginError(
        'permission-denied',
        'annotation',
        'create requires doc.annotate.create',
        { details: { required: 'doc.annotate.create' } },
      );
    }
  };
  const assertPage = (page: PageRef): void => {
    if (!ctx.document()?.pages.some((pageInfo) => pageRefsEqual(pageInfo.ref, page))) {
      throw new PluginError(
        'not-found',
        'annotation',
        `page ${page.pageObjectNumber} is not in this document`,
      );
    }
  };

  return { canRead, canCreate, canEdit, canDelete, allowsMutation, assertCreate, assertPage };
}

export type Authority = ReturnType<typeof createAuthority>;

import { PluginError, pageRefsEqual } from '@embedpdf/core';
import { annotDeletable, annotTransformable } from '@embedpdf/core-annotation';
import { annotationKey, type AnnotationRef, type PageRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from './context';
import type { AnnotationStore } from './store';

/**
 * Authorization: the engine's own collab resolver, mirrored. `canCreate` asks
 * about the caller's own identity; the mutation checks ask about the TARGET's
 * stamped owner, built from the record's EMBD metadata. An unstamped record
 * yields `{}`, which any narrowed grant denies — matching the engine, so a
 * control gated here never disagrees with the write's outcome.
 */
export function createAuthority(
  ctx: Pick<AnnotationContext, 'doc' | 'document'>,
  store: AnnotationStore,
) {
  const canRead = (): boolean => ctx.doc?.security.allows('doc.annotate.read') ?? true;
  const canCreate = (): boolean => ctx.doc?.security.allowsAnnotationCreate() ?? false;

  const mutationTarget = (ref: AnnotationRef): { userId?: string; groupId?: string } => {
    const d = store.model().byId[annotationKey(ref)]?.data;
    return {
      ...(d?.userId !== undefined ? { userId: d.userId } : {}),
      ...(d?.groupId !== undefined ? { groupId: d.groupId } : {}),
    };
  };
  const allowsMutation = (action: 'update' | 'delete', ref: AnnotationRef): boolean =>
    ctx.doc?.security.allowsAnnotationMutation(action, mutationTarget(ref)) ?? false;

  // The twins answer "would the verb succeed?" — authority AND flags, via
  // the SAME fused predicates the gestures and chrome consume, so a false
  // twin and a bare-outline render can never disagree (permissions.md).
  const canEdit = (ref: AnnotationRef): boolean => {
    const a = store.model().byId[annotationKey(ref)];
    return !!a && annotTransformable(a);
  };
  const canDelete = (ref: AnnotationRef): boolean => {
    const a = store.model().byId[annotationKey(ref)];
    return !!a && annotDeletable(a);
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
    if (!ctx.document()?.pages.some((p) => pageRefsEqual(p.ref, page))) {
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

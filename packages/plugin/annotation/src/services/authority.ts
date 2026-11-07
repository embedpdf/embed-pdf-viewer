import { annotDeletable, annotTransformable, type FlagBearer } from '@embedpdf/core-annotation';
import {
  annotationKey,
  deletedWith,
  type Annotation,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';

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

  /**
   * What keeps `ref` from being deleted; none when the delete goes through. Deleting an
   * annotation deletes what goes with it ({@link deletedWith}: its replies, review states,
   * grouped parts and popups), and the engine checks each of them. The annotation itself is
   * checked as anything deleted by hand is ({@link annotDeletable}); what goes with it is never
   * clicked itself, so only its lock and the session's right to delete it count: a review state
   * is hidden so that no viewer draws it, and it still goes with its thread.
   */
  const blockersOf = (ref: AnnotationRef): AnnotationRef[] => {
    const model = store.model();
    const key = annotationKey(ref);
    const record = model.byId[key];
    if (!record) return [ref];
    const page = model.order
      .map((id) => model.byId[id]?.annotation)
      .filter(
        (annotation): annotation is Annotation =>
          annotation?.page.objectNumber === ref.page.objectNumber,
      );
    return deletedWith(page, ref)
      .filter((member) => {
        const memberRecord = model.byId[annotationKey(member.ref)];
        if (!memberRecord) return true;
        return annotationKey(member.ref) === key
          ? !annotDeletable(memberRecord)
          : !goesAlong(memberRecord);
      })
      .map((member) => member.ref);
  };
  const canDelete = (ref: AnnotationRef): boolean => blockersOf(ref).length === 0;

  return { canRead, canCreate, canUpdate, canDelete, blockersOf, allowsMutation };
}

/** Deleted with the annotation it belongs to: unlocked, and the session's to delete. */
const goesAlong = (record: FlagBearer): boolean =>
  !record.annotation.locked && (record.authority?.delete ?? true);

export type Authority = ReturnType<typeof createAuthority>;

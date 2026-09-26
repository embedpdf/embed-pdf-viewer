import type { Id, Model } from '@embedpdf/core-annotation';
import {
  compareIsoDateTime,
  annotationKey,
  buildCommentThreads,
  type AnnotationDTO,
  type AnnotationRef,
  type CommentThread,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationContext, AnnotationServices } from '../services';

interface ThreadsIndex {
  threads: CommentThread[];
  byMember: Map<Id, CommentThread>;
}

/**
 * The comments lens's index: a derived, memoized threads index over the
 * substrate. Because every path — this session's changes, engine
 * confirmations, remote events, reloads — lands in the model, the sidebar
 * updates with zero extra wiring. The memo keys on the model's annotation content (byId/order
 * — hover and drafts don't invalidate) plus the layout (display order is
 * computed fresh against the live pages) and the session identity.
 */
export function createThreadIndex(
  ctx: Pick<AnnotationContext, 'doc' | 'document'>,
  { store }: Pick<AnnotationServices, 'store'>,
) {
  const currentUserId = (): string | undefined => ctx.doc?.security.identity?.userId;

  let memo:
    | (ThreadsIndex & {
        byId: Model['byId'];
        order: Model['order'];
        layout: string;
        userId: string | undefined;
      })
    | null = null;

  /** Value-stable layout key: display order is all the sort consumes, so
   *  the memo must survive hosts that rebuild the pages array per read. */
  const layoutSignature = (): string =>
    (ctx.document()?.pages ?? []).map((pageInfo) => pageInfo.ref.pageObjectNumber).join(',');

  const computeIndex = (): ThreadsIndex => {
    const model = store.model();
    // Records with engine data only: a new annotation has none until its
    // create is confirmed, and joins the index then.
    const dtos: AnnotationDTO[] = [];
    for (const id of model.order) {
      const data = model.byId[id]?.data;
      if (data) dtos.push(data);
    }
    const threads = buildCommentThreads(dtos, { currentUserId: currentUserId() });

    // Display order: page position first (live layout), then top of page
    // (PDF user space is y-up — larger `top` sits higher), then creation.
    const pages = ctx.document()?.pages ?? [];
    const displayIndex = new Map(pages.map((pageInfo, i) => [pageInfo.ref.pageObjectNumber, i]));
    threads.sort((left, right) => {
      const pa = displayIndex.get(left.page.pageObjectNumber) ?? Number.MAX_SAFE_INTEGER;
      const pb = displayIndex.get(right.page.pageObjectNumber) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      if (left.root.rect.top !== right.root.rect.top)
        return right.root.rect.top - left.root.rect.top;
      const leftCreated = left.root.createdAt;
      const rightCreated = right.root.createdAt;
      if (leftCreated === null || rightCreated === null) {
        return leftCreated === rightCreated ? 0 : leftCreated === null ? -1 : 1;
      }
      return compareIsoDateTime(leftCreated, rightCreated);
    });

    const byMember = new Map<Id, CommentThread>();
    for (const thread of threads) {
      byMember.set(annotationKey(thread.root.ref), thread);
      for (const dto of thread.replies) byMember.set(annotationKey(dto.ref), thread);
      for (const dto of thread.groupedParts) byMember.set(annotationKey(dto.ref), thread);
      for (const ref of thread.review.statusRefs) byMember.set(annotationKey(ref), thread);
    }
    return { threads, byMember };
  };

  const index = (): ThreadsIndex => {
    const model = store.model();
    const layout = layoutSignature();
    const userId = currentUserId();
    if (
      memo &&
      memo.byId === model.byId &&
      memo.order === model.order &&
      memo.layout === layout &&
      memo.userId === userId
    ) {
      return memo;
    }
    memo = { ...computeIndex(), byId: model.byId, order: model.order, layout, userId };
    return memo;
  };

  const threadOf = (ref: AnnotationRef): CommentThread => {
    const thread = index().byMember.get(annotationKey(ref));
    if (!thread) throw new Error('[annotation] no comment thread contains this ref');
    return thread;
  };
  const rootRefOf = (ref: AnnotationRef): AnnotationRef =>
    index().byMember.get(annotationKey(ref))?.root.ref ?? ref;
  const memberRefsOf = (thread: CommentThread): AnnotationRef[] => [
    ...thread.replies.map((dto) => dto.ref),
    ...thread.groupedParts.map((dto) => dto.ref),
    ...thread.review.statusRefs,
    thread.root.ref, // root LAST — children first keeps foreign readers coherent
  ];

  return { currentUserId, index, threadOf, rootRefOf, memberRefsOf };
}

export type ThreadIndex = ReturnType<typeof createThreadIndex>;

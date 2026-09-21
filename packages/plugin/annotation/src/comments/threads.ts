import type { Id, Model } from '@embedpdf/core-annotation';
import {
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
 * substrate. Because every path — optimistic writes, engine confirms, remote
 * events, hydration — lands in the model, the sidebar updates with zero
 * extra wiring. The memo keys on the model's annotation content (byId/order
 * — hover and drafts don't invalidate) PLUS the layout (display order is
 * computed fresh against the live pages) and the session identity.
 */
export function createThreadIndex(
  ctx: Pick<AnnotationContext, 'doc' | 'document'>,
  { store }: Pick<AnnotationServices, 'store'>,
) {
  const currentUserId = (): string | undefined => ctx.doc?.security.identity?.user_id;

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
    (ctx.document()?.pages ?? []).map((p) => p.ref.pageObjectNumber).join(',');

  const computeIndex = (): ThreadsIndex => {
    const m = store.model();
    // Committed truth only: optimistic tmp drafts have no DTO yet and join
    // the index when their create confirms.
    const dtos: AnnotationDTO[] = [];
    for (const id of m.order) {
      const data = m.byId[id]?.data;
      if (data) dtos.push(data);
    }
    const threads = buildCommentThreads(dtos, { currentUserId: currentUserId() });

    // Display order: page position first (live layout), then top of page
    // (PDF user space is y-up — larger `top` sits higher), then creation.
    const pages = ctx.document()?.pages ?? [];
    const displayIndex = new Map(pages.map((p, i) => [p.ref.pageObjectNumber, i]));
    threads.sort((a, b) => {
      const pa = displayIndex.get(a.page.pageObjectNumber) ?? Number.MAX_SAFE_INTEGER;
      const pb = displayIndex.get(b.page.pageObjectNumber) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      if (a.root.rect.top !== b.root.rect.top) return b.root.rect.top - a.root.rect.top;
      const ca = a.root.created ?? '';
      const cb = b.root.created ?? '';
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });

    const byMember = new Map<Id, CommentThread>();
    for (const t of threads) {
      byMember.set(annotationKey(t.root.ref), t);
      for (const r of t.replies) byMember.set(annotationKey(r.ref), t);
      for (const g of t.groupedParts) byMember.set(annotationKey(g.ref), t);
      for (const s of t.review.statusRefs) byMember.set(annotationKey(s), t);
    }
    return { threads, byMember };
  };

  const index = (): ThreadsIndex => {
    const m = store.model();
    const layout = layoutSignature();
    const userId = currentUserId();
    if (
      memo &&
      memo.byId === m.byId &&
      memo.order === m.order &&
      memo.layout === layout &&
      memo.userId === userId
    ) {
      return memo;
    }
    memo = { ...computeIndex(), byId: m.byId, order: m.order, layout, userId };
    return memo;
  };

  const threadOf = (ref: AnnotationRef): CommentThread => {
    const t = index().byMember.get(annotationKey(ref));
    if (!t) throw new Error('[annotation] no comment thread contains this ref');
    return t;
  };
  const rootRefOf = (ref: AnnotationRef): AnnotationRef =>
    index().byMember.get(annotationKey(ref))?.root.ref ?? ref;
  const memberRefsOf = (t: CommentThread): AnnotationRef[] => [
    ...t.replies.map((r) => r.ref),
    ...t.groupedParts.map((g) => g.ref),
    ...t.review.statusRefs,
    t.root.ref, // root LAST — children first keeps foreign readers coherent
  ];

  return { currentUserId, index, threadOf, rootRefOf, memberRefsOf };
}

export type ThreadIndex = ReturnType<typeof createThreadIndex>;

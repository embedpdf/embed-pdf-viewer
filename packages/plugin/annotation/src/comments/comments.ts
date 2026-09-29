import { annotContentsEditable, refOf } from '@embedpdf/core-annotation';
import {
  annotationKey,
  isDimension,
  toPageRef,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
  type PageBox,
} from '@embedpdf/engine-core/runtime';

import type { CommentPermissions, CommentsApi, ThreadDeleteResult } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { ThreadIndex } from './threads';
import type { Crud } from '../write/crud';
import { appliedOrThrow, appliedRefOf } from '../write/outcomes';

// Screen-anchored like a sticky note (it prints by the engine's default).
const REPLY_FLAGS = { noZoom: true, noRotate: true };
// Status annotations are metadata: hidden everywhere (our paint plane
// culls them regardless; `hidden` keeps foreign viewers from drawing an
// icon).
const STATUS_FLAGS = { hidden: true, noZoom: true, noRotate: true };

/** Where a reply or a state sits: the usual 20 × 20 icon at its root's top-left corner. */
const replyRect = (root: PageBox): PageBox => ({ x: root.x, y: root.y, width: 20, height: 20 });

/**
 * The conversation plane's verbs: every one compiles down to plain
 * annotation creates / patches / deletes (one write path), and each announces the thread it touched (its root, as it
 * was before the change).
 */
export function createComments(
  ctx: Pick<AnnotationContext, 'doc'>,
  { store, authority, events }: Pick<AnnotationServices, 'store' | 'authority' | 'events'>,
  threads: ThreadIndex,
  crud: Pick<Crud, 'update'>,
) {
  /** Create a conversation annotation (a reply or a review state): shown at once, then confirmed. */
  const createConversationAnnot = (
    pageObjectNumber: number,
    draft: AnnotationDraft,
  ): Promise<AnnotationRef> =>
    appliedRefOf(store.apply([{ type: 'create', page: toPageRef(pageObjectNumber), draft }]));

  const deleteOne = async (ref: AnnotationRef): Promise<void> => {
    await appliedOrThrow(store.apply([{ type: 'delete', ref }]));
  };

  const announce = (
    root: AnnotationRef,
    change: 'reply' | 'text' | 'status' | 'marked' | 'deleted',
  ) => events.threadChanged.emit({ rootRef: root, change });

  const comments: CommentsApi = {
    listThreads: () => threads.index().threads,
    getThread: (ref) => threads.index().byMember.get(annotationKey(ref)) ?? null,
    onThreadChanged: events.threadChanged.on,

    reply: async (ref, text) => {
      const root = threads.rootRefOf(ref);
      const thread = threads.threadOf(ref);
      const created = await createConversationAnnot(thread.page.pageObjectNumber, {
        subtype: 'text',
        rect: replyRect(thread.root.rect),
        icon: 'comment',
        contents: text,
        reply: { to: thread.root.ref },
        ...REPLY_FLAGS,
      });
      announce(root, 'reply');
      return created;
    },

    setText: async (ref, text) => {
      const root = threads.rootRefOf(ref);
      const record = store.model().byId[annotationKey(ref)];
      if (record && isDimension(record.annotation))
        throw new Error('[annotation] measurement contents are derived');
      if (!refOf(record)) throw new Error('[annotation] cannot edit an uncommitted annotation');
      await crud.update(ref, {
        subtype: record.annotation.subtype,
        contents: text,
      } as AnnotationPatch);
      announce(root, 'text');
    },

    setStatus: async (ref, state) => {
      const root = threads.rootRefOf(ref);
      const thread = threads.threadOf(ref);
      const userId = threads.currentUserId();
      // ISO chain: reply to the caller's previous state annotation when one
      // exists, else to the root. Readers everywhere (ours included) accept
      // both shapes.
      const previous = userId ? thread.review.byReviewer[userId] : undefined;
      await createConversationAnnot(thread.page.pageObjectNumber, {
        subtype: 'text',
        rect: replyRect(thread.root.rect),
        reply: { to: previous?.ref ?? thread.root.ref },
        state,
        stateModel: 'review',
        ...STATUS_FLAGS,
      });
      announce(root, 'status');
    },

    setMarked: async (ref, marked) => {
      const root = threads.rootRefOf(ref);
      const thread = threads.threadOf(ref);
      await createConversationAnnot(thread.page.pageObjectNumber, {
        subtype: 'text',
        rect: replyRect(thread.root.rect),
        reply: { to: thread.root.ref },
        state: marked ? 'marked' : 'unmarked',
        stateModel: 'marked',
        ...STATUS_FLAGS,
      });
      announce(root, 'marked');
    },

    delete: async (ref) => {
      const root = threads.rootRefOf(ref);
      await deleteOne(ref);
      announce(root, 'deleted');
    },

    deleteThread: async (ref): Promise<ThreadDeleteResult> => {
      const root = threads.rootRefOf(ref);
      const thread = threads.threadOf(ref);
      const members = threads.memberRefsOf(thread);
      // A courtesy preflight: all or nothing, as the engine decides it.
      const blocked = members.filter((ref) => !authority.canDelete(ref));
      if (blocked.length > 0) {
        announce(root, 'deleted');
        return {
          deleted: [],
          failed: blocked.map((ref) => ({ ref: ref, error: new Error('delete not permitted') })),
        };
      }
      // Deleting the root deletes the thread, in one change: the engine
      // checks every member again and deletes all of them or none.
      try {
        await deleteOne(root);
        return { deleted: members, failed: [] };
      } catch (error) {
        return { deleted: [], failed: [{ ref: root, error }] };
      } finally {
        announce(root, 'deleted');
      }
    },

    getPermissions: (ref): CommentPermissions => {
      const thread = threads.index().byMember.get(annotationKey(ref)) ?? null;
      return {
        // Replying and setting status create new annotations — gated on
        // the caller's own identity, not the target's owner.
        canReply: authority.canCreate(),
        canSetStatus: authority.canCreate(),
        canEditText: (() => {
          const annotation = store.model().byId[annotationKey(ref)];
          return (
            !!annotation && !isDimension(annotation.annotation) && annotContentsEditable(annotation)
          );
        })(),
        canDelete: authority.canDelete(ref),
        canDeleteThread: thread !== null && threads.memberRefsOf(thread).every(authority.canDelete),
      };
    },
  };

  return { api: { comments } };
}

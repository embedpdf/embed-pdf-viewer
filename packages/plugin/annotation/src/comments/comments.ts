import { PluginError } from '@embedpdf/core';
import { annotContentsEditable, refOf } from '@embedpdf/core-annotation';
import {
  annotationKey,
  isDimension,
  toPageRef,
  type Annotation,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
  type PageBox,
} from '@embedpdf/engine-core/runtime';

import type { CommentsApi, ThreadDeleteResult } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { ThreadIndex } from './threads';
import type { Crud } from '../write/crud';
import { appliedAnnotationOf, appliedOrThrow, appliedRefOf } from '../write/outcomes';

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
  ctx: Pick<AnnotationContext, 'doc' | 'assertAllowed' | 'cancellable'>,
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

  const deleteOne = async (ref: AnnotationRef, signal?: AbortSignal): Promise<void> => {
    await ctx.cancellable(signal, appliedOrThrow(store.apply([{ type: 'delete', ref }])));
  };

  /** Whether this comment's text can change: the user's update right and its `lockedContents`. */
  const canSetText = (ref: AnnotationRef): boolean => {
    const record = store.model().byId[annotationKey(ref)];
    return !!record && !isDimension(record.annotation) && annotContentsEditable(record);
  };

  const announce = (
    root: AnnotationRef,
    change: 'reply' | 'text' | 'status' | 'marked' | 'deleted',
  ) => events.threadChanged.emit({ rootRef: root, change });

  const comments: CommentsApi = {
    listThreads: () => threads.index().threads,
    getThread: (ref) => threads.index().byMember.get(annotationKey(ref)) ?? null,
    onThreadChanged: events.threadChanged.on,

    reply: async (ref, text, options = {}) => {
      ctx.assertAllowed('annotations:create', 'annotation.comments.reply');
      const root = threads.rootRefOf(ref);
      const thread = threads.threadOf(ref);
      const applied = store.apply([
        {
          type: 'create',
          page: toPageRef(thread.page.objectNumber),
          draft: {
            subtype: 'text',
            rect: replyRect(thread.root.rect),
            icon: 'comment',
            contents: text,
            reply: { to: thread.root.ref },
            ...REPLY_FLAGS,
          },
        },
      ]);
      const annotation: Annotation | null = await ctx.cancellable(
        options.signal,
        appliedAnnotationOf(applied),
      );
      announce(root, 'reply');
      if (!annotation) {
        throw new PluginError('operation-failed', 'annotation', 'the reply could not be created');
      }
      return { annotation };
    },

    setText: async (ref, text, options = {}) => {
      const root = threads.rootRefOf(ref);
      const record = store.model().byId[annotationKey(ref)];
      if (record && isDimension(record.annotation)) {
        throw new PluginError(
          'invalid-input',
          'annotation',
          "a measurement's text is worked out from its points",
        );
      }
      if (!refOf(record)) {
        throw new PluginError('not-found', 'annotation', `no annotation ${annotationKey(ref)}`);
      }
      await crud.update(
        ref,
        { subtype: record.annotation.subtype, contents: text } as AnnotationPatch,
        undefined,
        options,
      );
      announce(root, 'text');
    },

    setStatus: async (ref, state, options = {}) => {
      ctx.assertAllowed('annotations:create', 'annotation.comments.setStatus');
      const root = threads.rootRefOf(ref);
      const thread = threads.threadOf(ref);
      const userId = threads.currentUserId();
      // ISO chain: reply to the caller's previous state annotation when one
      // exists, else to the root. Readers everywhere (ours included) accept
      // both shapes.
      const previous = userId ? thread.review.byReviewer[userId] : undefined;
      await ctx.cancellable(
        options.signal,
        createConversationAnnot(thread.page.objectNumber, {
          subtype: 'text',
          rect: replyRect(thread.root.rect),
          reply: { to: previous?.ref ?? thread.root.ref },
          state,
          stateModel: 'review',
          ...STATUS_FLAGS,
        }),
      );
      announce(root, 'status');
    },

    setMarked: async (ref, marked, options = {}) => {
      ctx.assertAllowed('annotations:create', 'annotation.comments.setMarked');
      const root = threads.rootRefOf(ref);
      const thread = threads.threadOf(ref);
      await ctx.cancellable(
        options.signal,
        createConversationAnnot(thread.page.objectNumber, {
          subtype: 'text',
          rect: replyRect(thread.root.rect),
          reply: { to: thread.root.ref },
          state: marked ? 'marked' : 'unmarked',
          stateModel: 'marked',
          ...STATUS_FLAGS,
        }),
      );
      announce(root, 'marked');
    },

    delete: async (ref, options = {}) => {
      const root = threads.rootRefOf(ref);
      await deleteOne(ref, options.signal);
      announce(root, 'deleted');
    },

    deleteThread: async (ref, options = {}): Promise<ThreadDeleteResult> => {
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
        await deleteOne(root, options.signal);
        return { deleted: members, failed: [] };
      } catch (error) {
        return { deleted: [], failed: [{ ref: root, error }] };
      } finally {
        announce(root, 'deleted');
      }
    },

    // Replying and setting a review state or a check mark create new
    // annotations: gated on the user's own identity, not the target's owner.
    canReply: () => authority.canCreate(),
    canSetStatus: () => authority.canCreate(),
    canSetMarked: () => authority.canCreate(),
    canSetText,
    canDelete: (ref) => authority.canDelete(ref),
    canDeleteThread: (ref) => {
      const thread = threads.index().byMember.get(annotationKey(ref)) ?? null;
      return thread !== null && threads.memberRefsOf(thread).every(authority.canDelete);
    },
  };

  return { api: { comments } };
}

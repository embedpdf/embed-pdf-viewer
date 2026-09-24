import { annotContentsEditable } from '@embedpdf/core-annotation';
import {
  annotationKey,
  isDimension,
  toPageRef,
  type AnnotationDTO,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';

import type { CommentPermissions, CommentsApi, ThreadDeleteResult } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { ThreadIndex } from './threads';
import type { Crud } from '../write/crud';
import { named } from '../write/named';

// Screen-anchored like a sticky note; `print` for Acrobat parity.
const REPLY_FLAGS = { print: true, noZoom: true, noRotate: true };
// Status annotations are metadata: hidden everywhere (our paint plane
// culls them regardless; `hidden` keeps foreign viewers from drawing an
// icon).
const STATUS_FLAGS = { hidden: true, noZoom: true, noRotate: true };

/**
 * The conversation plane's verbs: every one compiles down to plain
 * annotation creates / patches / deletes (one write path), and each announces the thread it touched (its root, as it
 * was before the change).
 */
export function createComments(
  ctx: Pick<AnnotationContext, 'doc'>,
  { store, authority, events }: Pick<AnnotationServices, 'store' | 'authority' | 'events'>,
  threads: ThreadIndex,
  crud: Pick<Crud, 'updateRaw'>,
) {
  /** Create a conversation annotation (a reply or a review state); the fold adds it to the model. */
  const createConversationAnnot = async (
    pageObjectNumber: number,
    draft: AnnotationDraft,
  ): Promise<AnnotationDTO> => {
    const result = await ctx.doc.page(toPageRef(pageObjectNumber)).annotations.create(named(draft));
    return result.created;
  };

  const deleteOne = async (ref: AnnotationRef): Promise<void> => {
    await ctx.doc.page(ref.page).annotations.delete(ref);
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
        rect: thread.root.rect,
        icon: 'comment',
        contents: text,
        reply: { to: thread.root.ref },
        ...REPLY_FLAGS,
      } as AnnotationDraft);
      announce(root, 'reply');
      return created.ref;
    },

    setText: async (ref, text) => {
      const root = threads.rootRefOf(ref);
      const data = store.model().byId[annotationKey(ref)]?.data;
      if (data && isDimension(data))
        throw new Error('[annotation] measurement contents are derived');
      const subtype = data?.subtype;
      if (!subtype) throw new Error('[annotation] cannot edit an uncommitted annotation');
      await crud.updateRaw(ref, { subtype, contents: text } as AnnotationPatch);
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
        rect: thread.root.rect,
        reply: { to: previous?.ref ?? thread.root.ref },
        state,
        stateModel: 'review',
        ...STATUS_FLAGS,
      } as AnnotationDraft);
      announce(root, 'status');
    },

    setMarked: async (ref, marked) => {
      const root = threads.rootRefOf(ref);
      const thread = threads.threadOf(ref);
      await createConversationAnnot(thread.page.pageObjectNumber, {
        subtype: 'text',
        rect: thread.root.rect,
        reply: { to: thread.root.ref },
        state: marked ? 'marked' : 'unmarked',
        stateModel: 'marked',
        ...STATUS_FLAGS,
      } as AnnotationDraft);
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
      // Preflight: all-or-nothing. A blocked member means nothing deletes —
      // a half-deleted thread orphans replies in every other viewer.
      const blocked = members.filter((ref) => !authority.canDelete(ref));
      if (blocked.length > 0) {
        announce(root, 'deleted');
        return {
          deleted: [],
          failed: blocked.map((ref) => ({ ref: ref, error: new Error('delete not permitted') })),
        };
      }
      const deleted: AnnotationRef[] = [];
      const failed: ThreadDeleteResult['failed'] = [];
      for (const member of members) {
        // A child failure (a race: someone else acted first) stops the
        // cascade before the root, so nothing orphans.
        if (failed.length > 0) break;
        try {
          await deleteOne(member);
          deleted.push(member);
        } catch (error) {
          failed.push({ ref: member, error });
        }
      }
      announce(root, 'deleted');
      return { deleted, failed };
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
            !!annotation &&
            !(annotation.data && isDimension(annotation.data)) &&
            annotContentsEditable(annotation)
          );
        })(),
        canDelete: authority.canDelete(ref),
        canDeleteThread: thread !== null && threads.memberRefsOf(thread).every(authority.canDelete),
      };
    },
  };

  return { api: { comments } };
}

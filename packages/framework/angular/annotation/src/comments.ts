/**
 * Comments and replies, as their own service: `inject(EpdfComments)`. A comments sidebar needs
 * the threads and the verbs on them, not the rest of the annotation API, so they get a service
 * of their own (React's `useComments()` and `useCommentThreads()`). `withAnnotation()` provides
 * it.
 *
 * The threads come with where their page is shown (`pageIndex`, `pageLabel`): the join of the
 * plugin's threads and the document's page list is `@embedpdf/web`'s, the same for every
 * framework.
 */
import { computed, Injectable, type Signal } from '@angular/core';
import { annotationKey, type PageInfo } from '@embedpdf/core';
import { EpdfPluginService, injectDocumentScope } from '@embedpdf/angular/runtime';
import {
  AnnotationToken,
  type AnnotationCapability,
  type AnnotationRef,
  type CommentThread,
  type CommentThreadChangedEvent,
  type CommentsApi,
} from '@embedpdf/plugin-annotation';
import { enrichCommentThreads } from '@embedpdf/web';
import type { Observable } from 'rxjs';

/**
 * A comment thread with where its page is shown now. Its identity stays `page`, like every
 * annotation's; these two fields are for showing it, and follow page moves and deletes.
 */
export interface CommentThreadView extends CommentThread {
  /** The page's place in the document, from 0; `-1` for the moment after its page is deleted. */
  pageIndex: number;
  /**
   * The page's label when the PDF has one (`'iv'`, `'A-2'`), else its number from 1, as a
   * string: print it as it is.
   */
  pageLabel: string;
}

const NO_THREADS: readonly CommentThread[] = Object.freeze([]);
const NO_PAGES: readonly PageInfo[] = Object.freeze([]);

/**
 * The comments of the document in scope (`[epdfDocumentScope]`), else the active one: every
 * thread as `threads()`, one as `threadOf(ref)`, the verbs (`reply()`, `setText()`,
 * `setStatus()`, `setMarked()`, `delete()`, `deleteThread()`), the checks (`canReply(ref)`, …),
 * which follow the document and its permissions in a template, and `threadChanged$`. Without a
 * document the threads are empty and the verbs refuse with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfComments extends EpdfPluginService<AnnotationCapability> {
  constructor() {
    super({ name: 'EpdfComments', feature: 'withAnnotation()', token: AnnotationToken });
  }

  /** Every thread, in reading order, read once. In a template, use `threads()`. */
  readonly listThreads: CommentsApi['listThreads'] = this.binding.namespaceMethod(
    'comments',
    'listThreads',
  );
  /** The thread a comment is in (its first comment, a reply or a review state), read once, or null. */
  readonly getThread: CommentsApi['getThread'] = this.binding.namespaceMethod(
    'comments',
    'getThread',
  );
  /** Reply to the thread's first comment, whichever comment you pass. Resolves `{ annotation }`. */
  readonly reply: CommentsApi['reply'] = this.binding.namespaceMethod('comments', 'reply');
  /** Change a comment's text. */
  readonly setText: CommentsApi['setText'] = this.binding.namespaceMethod('comments', 'setText');
  /** Set the user's review state on a thread, such as `'accepted'`. */
  readonly setStatus: CommentsApi['setStatus'] = this.binding.namespaceMethod(
    'comments',
    'setStatus',
  );
  /** Check a thread off for the user, or clear the check mark. */
  readonly setMarked: CommentsApi['setMarked'] = this.binding.namespaceMethod(
    'comments',
    'setMarked',
  );
  /** Delete a comment with its replies; the first comment of a thread deletes the thread. */
  readonly delete: CommentsApi['delete'] = this.binding.namespaceMethod('comments', 'delete');
  /** Delete a whole thread, all of it or none. Resolves `{ deleted, failed }`. */
  readonly deleteThread: CommentsApi['deleteThread'] = this.binding.namespaceMethod(
    'comments',
    'deleteThread',
  );
  /** Whether the user may reply to this thread. */
  readonly canReply: CommentsApi['canReply'] = this.binding.namespaceMethod('comments', 'canReply');
  /** Whether the user may change this comment's text. */
  readonly canSetText: CommentsApi['canSetText'] = this.binding.namespaceMethod(
    'comments',
    'canSetText',
  );
  /** Whether the user may set a review state on this thread. */
  readonly canSetStatus: CommentsApi['canSetStatus'] = this.binding.namespaceMethod(
    'comments',
    'canSetStatus',
  );
  /** Whether the user may check this thread off. */
  readonly canSetMarked: CommentsApi['canSetMarked'] = this.binding.namespaceMethod(
    'comments',
    'canSetMarked',
  );
  /** Whether the user may delete this comment. */
  readonly canDelete: CommentsApi['canDelete'] = this.binding.namespaceMethod(
    'comments',
    'canDelete',
  );
  /** Whether the user may delete every comment in this thread. */
  readonly canDeleteThread: CommentsApi['canDeleteThread'] = this.binding.namespaceMethod(
    'comments',
    'canDeleteThread',
  );

  /** A thread changed through this viewer: a reply, a text, a review state, a check mark or a delete. */
  readonly threadChanged$: Observable<CommentThreadChangedEvent> = this.binding.stream(
    (annotation) => annotation.comments.onThreadChanged,
  );

  private readonly scope = injectDocumentScope();
  private readonly rawThreads = this.binding.select(
    (annotation) => annotation.comments.listThreads(),
    NO_THREADS,
  );
  /** The pages of this service's document: a page moved or deleted moves its threads' labels. */
  private readonly pages = this.binding.host.read(
    (kernel) => {
      const id = this.scope() ?? kernel.documents.getActiveId();
      return id ? kernel.documents.listPages(id) : NO_PAGES;
    },
    () => NO_PAGES,
  );

  /**
   * Every thread in the document, in reading order (by page, then from the top), each with its
   * page's `pageIndex` and `pageLabel`. Own, remote and reloaded changes all show. The same
   * array until a thread or a page changes; empty without a document.
   */
  readonly threads: Signal<readonly CommentThreadView[]> = computed(() =>
    enrichCommentThreads(this.rawThreads(), this.pages()),
  );

  /**
   * The thread a comment is in, whether you pass its first comment, a reply or a review state,
   * with its page's label; null for null, or a comment in no thread. Pass the ref, or a function
   * that reads it (`() => this.note().ref`).
   */
  threadOf(
    ref: AnnotationRef | null | (() => AnnotationRef | null | undefined),
  ): Signal<CommentThreadView | null> {
    const refOf = typeof ref === 'function' ? ref : () => ref;
    const thread = this.binding.select(
      (annotation) => {
        const member = refOf();
        return member ? annotation.comments.getThread(member) : null;
      },
      null,
      Object.is,
    );
    return computed(() => {
      const found = thread();
      if (!found) return null;
      const root = annotationKey(found.root.ref);
      return this.threads().find((view) => annotationKey(view.root.ref) === root) ?? null;
    });
  }
}

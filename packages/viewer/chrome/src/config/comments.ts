/**
 * The comment commands, for the menu of a card in the comments panel: the thread's review
 * status (ISO 32000 §12.5.6.3: accepted, rejected, cancelled, completed or none) and deleting
 * the thread. They act on the thread of the selected annotation; the panel selects a card's
 * annotation before it opens the card's menu. Writing needs the `comments.writing` feature and
 * the engine's rights (`comments.canSetStatus()`, `comments.canDeleteThread()`).
 */
import { AnnotationToken, type CommentThread } from '@embedpdf/react/annotation';
import type { CommandDef } from '@embedpdf/react/commands';

type Ctx = Parameters<NonNullable<CommandDef['run']>>[0];

/** The menu of a card in the comments panel: the commands below, for that card's thread. */
export const COMMENT_ITEM_MENU = 'comment-item';

/** The statuses a card's menu sets: ISO 32000's Review model, in Acrobat's order. */
export const REVIEW_STATES = ['accepted', 'rejected', 'cancelled', 'completed', 'none'] as const;

/** A review state's label key; a custom state shows as it is written. */
export const REVIEW_STATE_LABEL_KEYS: Readonly<Record<string, string>> = {
  none: 'demo.commentsStatusNone',
  accepted: 'demo.commentsStatusAccepted',
  rejected: 'demo.commentsStatusRejected',
  cancelled: 'demo.commentsStatusCancelled',
  completed: 'demo.commentsStatusCompleted',
};

/** Whether anything is said in a thread: its annotation's own text or a reply. */
export const hasComment = (thread: Pick<CommentThread, 'root' | 'replies'>): boolean =>
  !!thread.root.contents?.trim() || thread.replies.length > 0;

/** A thread's status: the last review change anyone made, `'none'` when there was none. */
export const reviewStateOf = (thread: Pick<CommentThread, 'review'>): string =>
  thread.review.lastChange?.state ?? 'none';

const commentsOf = (commandContext: Ctx) =>
  commandContext.tryGet(AnnotationToken)?.comments ?? null;

/** The thread of the first selected annotation. */
const selectedThread = (commandContext: Ctx): CommentThread | null => {
  const annotation = commandContext.tryGet(AnnotationToken);
  const [first] = annotation?.selection.list() ?? [];
  return first ? (annotation?.comments.getThread(first.ref) ?? null) : null;
};

/** A status is about what was said: a thread with nothing in it has none to set. */
const canSetStatus = (commandContext: Ctx): boolean => {
  const thread = selectedThread(commandContext);
  return (
    thread !== null &&
    hasComment(thread) &&
    !!commentsOf(commandContext)?.canSetStatus(thread.root.ref)
  );
};

const statusCommand = (state: (typeof REVIEW_STATES)[number]): CommandDef => ({
  id: `comment:status-${state}`,
  labelKey: REVIEW_STATE_LABEL_KEYS[state]!,
  categories: ['comments.writing'],
  visible: canSetStatus,
  active: (commandContext) => {
    const thread = selectedThread(commandContext);
    return thread !== null && reviewStateOf(thread) === state;
  },
  run: async (commandContext) => {
    const thread = selectedThread(commandContext);
    if (thread) await commentsOf(commandContext)?.setStatus(thread.root.ref, state);
  },
});

export const commentCommands: CommandDef[] = [
  ...REVIEW_STATES.map(statusCommand),
  {
    id: 'comment:delete-thread',
    labelKey: 'demo.commentsDeleteThread',
    icon: 'trash',
    categories: ['comments.writing'],
    enabled: (commandContext) => {
      const thread = selectedThread(commandContext);
      return thread !== null && !!commentsOf(commandContext)?.canDeleteThread(thread.root.ref);
    },
    run: async (commandContext) => {
      const thread = selectedThread(commandContext);
      if (thread) await commentsOf(commandContext)?.deleteThread(thread.root.ref);
    },
  },
  // A card's menu, opened from the card's own button or by a right-click on it.
  {
    id: 'menu:comment-item',
    labelKey: 'commands.commentThread.more',
    icon: 'dots',
    menu: COMMENT_ITEM_MENU,
    categories: ['comments.writing'],
  },
];

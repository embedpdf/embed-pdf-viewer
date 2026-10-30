import { useEffect, useMemo, useRef, useState } from 'react';
import { useCapability } from '@embedpdf/react/runtime';
import {
  AnnotationToken,
  annotationKey,
  useAnnotationState,
  useComments,
  useCommentThreads,
  type Annotation,
  type AnnotationRef,
  type CommentThreadView,
} from '@embedpdf/react/annotation';
import { StageToken } from '@embedpdf/react/stage';
import { useCommand, useCommands, useCommandsSettings } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { useLayoutEnv } from '../config-context';
import { REVIEW_STATE_LABEL_KEYS, hasComment, reviewStateOf } from '../config/comments';
import { Icon } from './icons';
import { commentIconAccent, commentTypeConfig } from './comment-config';
import { CommandButton, buttonClass, buttonPart } from './toolbar';

/**
 * The comments sidebar (right panel): a live view over the conversation
 * plane — page-grouped sections, and a card that identifies its annotation at
 * a glance by the type's glyph tinted with that annotation's own colors.
 *
 * A card shows what its thread has, and offers what can be done next:
 * - nothing said yet: a box to write the comment, which becomes the
 *   annotation's own text (`/Contents`) where it may change, else a reply;
 * - a conversation: the comment, its replies, and a box to reply;
 * - a status (ISO 32000 §12.5.6.3): a chip by the date, only once one is set.
 * The box shows on the selected card, and on one that holds a draft. The
 * check marks a thread completed; the card's menu (`menu:comment-item`) sets
 * any review status and deletes the thread.
 *
 * There is no per-page loading dance: the plugin hydrates the whole document
 * at open (`annotations.list()`), so the list is complete the moment `hydration()`
 * says so, whether or not a page was ever scrolled to.
 *
 * Selection is two-way: clicking a card selects the annotation and
 * flies the camera to it (`stage.reveal`, the same verb search hits use);
 * selecting in the document scrolls that card into view here.
 *
 * Every action routes through the `comments` verbs — plain annotation writes
 * on the one optimistic pipeline — and every control is gated by
 * `permissionsFor`, the engine's own collab-resolver mirrors: what shows here
 * is what the engine will allow. With writing turned off (`comments.writing`,
 * which `readOnly` turns off) the threads are only read: no box, no check,
 * no menu, no edit and no delete.
 */

const dateLabel = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Whether people write here: the `comments.writing` feature is on. */
function useWriting(): boolean {
  const commands = useCommands();
  // Read again whenever what's turned off changes.
  useCommandsSettings((settings) => settings.disabledCategories);
  return !commands.isCategoryDisabled('comments.writing');
}

export function CommentsPanel() {
  const t = useT();
  const writing = useWriting();
  const status = useAnnotationState((state) => state.status);
  const comments = useComments();
  const threads = useCommentThreads();
  const anno = useCapability(AnnotationToken);
  const stage = useCapability(StageToken);
  const selected = useAnnotationState((state) => state.selected);
  const selection = useMemo(() => selected.map((annotation) => annotation.ref), [selected]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});

  /** Which thread the document's selection points at — any member counts, so
   *  selecting a reply's parent shape highlights the same card. */
  const selectedThreadKey = useMemo(() => {
    for (const ref of selection) {
      const thread = comments.getThread(ref);
      if (thread) return annotationKey(thread.root.ref);
    }
    return null;
    // `selection` identity changes on every selection write — the right key.
  }, [selection, comments]);

  // Reverse sync: the selected card scrolls itself into view, unless it's in view already
  // (pressing a card's check or menu selects it, and the list mustn't move under the press).
  useEffect(() => {
    if (!selectedThreadKey || !scrollRef.current) return;
    const element = cardRefs.current[selectedThreadKey];
    if (!element) return;
    const container = scrollRef.current;
    const card = element.getBoundingClientRect();
    const view = container.getBoundingClientRect();
    if (card.top >= view.top && card.bottom <= view.bottom) return;
    const top =
      element.offsetTop -
      container.clientHeight / 2 +
      element.clientHeight / 2 -
      container.offsetTop;
    container.scrollTo({ top, behavior: 'smooth' });
  }, [selectedThreadKey]);

  /** Press a card's check or menu: the card's annotation is what they act on. */
  const pick = (view: CommentThreadView) => anno.selection.set([view.root.ref]);

  /** Click a card: select the annotation and fly the camera to it. */
  const goTo = (view: CommentThreadView) => {
    anno.selection.set([view.root.ref]);
    if (view.pageIndex < 0) return;
    // Anchor values are viewport fractions (0–1), not percentages:
    // the annotation lands a third down the viewport, the find-bar feel.
    stage?.reveal(view.pageIndex, {
      rect: view.root.rect,
      anchor: { x: 'center', y: 0.35 },
      behavior: 'smooth',
    });
  };

  // Page-grouped, preserving the lens's display order within each page.
  const byPage = useMemo(() => {
    const groups = new Map<number, CommentThreadView[]>();
    for (const view of threads) {
      const arr = groups.get(view.pageIndex);
      if (arr) arr.push(view);
      else groups.set(view.pageIndex, [view]);
    }
    return [...groups.entries()].sort((left, right) => left[0] - right[0]);
  }, [threads]);

  if (status === 'loading') return <Empty icon="comment" text={t('demo.commentsLoading')} />;
  if (status === 'forbidden') return <Empty icon="lock" text={t('demo.commentsForbidden')} />;
  if (status === 'error') {
    return (
      <Empty icon="alertTriangle" text={t('demo.commentsError')}>
        <button
          type="button"
          onClick={() => void anno.refresh()}
          className="bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm font-medium"
        >
          {t('demo.commentsRetry')}
        </button>
      </Empty>
    );
  }
  if (threads.length === 0) {
    return (
      <Empty
        icon="comment"
        text={t(writing ? 'demo.commentsEmpty' : 'demo.commentsEmptyReadOnly')}
      />
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-5 p-3">
        {byPage.map(([pageIndex, group]) => {
          const count = group.reduce((sum, view) => sum + commentCountOf(view), 0);
          return (
            <div key={pageIndex} className="flex flex-col gap-2">
              <div className="bg-surface sticky top-0 z-10">
                <div className="border-border-subtle border-b pb-1.5">
                  <h3 className="text-fg text-sm font-semibold">
                    {t('demo.commentsPage', { params: { page: group[0]!.pageLabel } })}
                  </h3>
                  {count > 0 && (
                    <p className="text-fg-muted text-xs">
                      {t(count === 1 ? 'demo.commentCount' : 'demo.commentCountPlural', {
                        params: { count: String(count) },
                      })}
                    </p>
                  )}
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {group.map((view) => {
                  const key = annotationKey(view.root.ref);
                  return (
                    <ThreadCard
                      key={key}
                      view={view}
                      writing={writing}
                      selected={selectedThreadKey === key}
                      onSelect={() => goTo(view)}
                      onPick={() => pick(view)}
                      cardRef={(element) => {
                        cardRefs.current[key] = element;
                      }}
                    />
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty({
  icon,
  text,
  children,
}: {
  icon: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Icon name={icon} size={32} className="text-fg-muted" />
      <p className="text-fg-muted text-sm">{text}</p>
      {children}
    </div>
  );
}

function ThreadCard({
  view,
  writing,
  selected,
  onSelect,
  onPick,
  cardRef,
}: {
  view: CommentThreadView;
  /** Whether people write here; without it the thread is only read. */
  writing: boolean;
  selected: boolean;
  onSelect: () => void;
  /** Select the card's annotation without moving the camera: what its check and menu act on. */
  onPick: () => void;
  cardRef: (element: HTMLLIElement | null) => void;
}) {
  const t = useT();
  const comments = useComments();
  // A finger has no hover: the check and the menu show on every card.
  const { touch } = useLayoutEnv();
  const menuButton = useRef<HTMLSpanElement>(null);
  const [draft, setDraft] = useState('');
  const root = view.root.ref;
  const said = hasComment(view);
  // The first comment is the annotation's own text where that may change, else a reply.
  const writesText = !said && comments.canSetText(root);
  const perms = {
    canDeleteThread: writing && comments.canDeleteThread(root),
    canSetStatus: writing && said && comments.canSetStatus(root),
    canWrite: writing && (writesText || comments.canReply(root)),
  };
  const hasMenu = perms.canSetStatus || perms.canDeleteThread;
  const config = commentTypeConfig(view.root);
  const state = reviewStateOf(view);
  const completed = state === 'completed';

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void (writesText ? comments.setText(root, text) : comments.reply(root, text));
  };

  return (
    <li
      ref={cardRef}
      onClick={onSelect}
      onContextMenu={(event) => {
        if (!hasMenu) return;
        event.preventDefault();
        onPick();
        menuButton.current?.querySelector('button')?.click();
      }}
      className={`bg-surface group cursor-pointer rounded-lg border shadow-sm transition-all hover:shadow-md ${
        selected ? 'border-accent ring-accent/40 ring-2' : 'border-border-subtle'
      }`}
    >
      <div className="flex flex-col gap-2 p-3">
        {/* identity row: the annotation's own glyph + color is the anchor */}
        <div className="flex items-start gap-2.5">
          <div
            className="bg-hover grid h-8 w-8 shrink-0 place-items-center rounded-full"
            title={t(config.labelKey, { fallback: config.label })}
          >
            <Icon name={config.icon} size={18} accent={commentIconAccent(view.root)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-fg truncate text-sm font-medium">
              {view.root.author ?? t('demo.commentsAnonymous')}
            </div>
            <div className="text-fg-muted flex items-center gap-1.5 text-xs">
              <span>{dateLabel(view.root.modifiedAt ?? view.root.createdAt)}</span>
              {state !== 'none' && (
                <span
                  title={
                    view.review.lastChange?.by
                      ? `${statusLabel(t, state)} · ${view.review.lastChange.by}`
                      : undefined
                  }
                  className="bg-accent-light text-accent rounded px-1.5 text-[11px] font-medium"
                >
                  {statusLabel(t, state)}
                </span>
              )}
            </div>
          </div>
          {(perms.canSetStatus || hasMenu) && (
            <div
              onClick={(event) => event.stopPropagation()}
              className={`flex shrink-0 items-center ${
                selected || touch
                  ? ''
                  : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
              }`}
            >
              {perms.canSetStatus && (
                <button
                  type="button"
                  aria-pressed={completed}
                  aria-label={t('demo.commentsMarkCompleted')}
                  title={t('demo.commentsMarkCompleted')}
                  part={buttonPart(completed)}
                  onClick={() => void comments.setStatus(root, completed ? 'none' : 'completed')}
                  className={buttonClass(completed)}
                >
                  <Icon name="circleCheck" size={20} />
                </button>
              )}
              {hasMenu && (
                <span ref={menuButton} onPointerDownCapture={onPick}>
                  <CardMenuButton />
                </span>
              )}
            </div>
          )}
        </div>

        <CommentBody
          annotationRef={view.root.ref}
          text={view.root.contents ?? ''}
          deletable={false}
          writing={writing}
        />

        {view.replies.length > 0 && (
          <div className="border-border-subtle flex flex-col gap-2 border-t pt-2">
            {view.replies.map((replyDto) => (
              <Reply key={annotationKey(replyDto.ref)} dto={replyDto} writing={writing} />
            ))}
          </div>
        )}

        {/* The box shows on the selected card, and stays while it holds a draft. */}
        {perms.canWrite && (selected || draft) && (
          <div
            className={`flex items-center gap-1.5 ${said ? 'border-border-subtle border-t pt-2' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="text"
              value={draft}
              placeholder={t(
                said ? 'demo.commentsReplyPlaceholder' : 'demo.commentsAddPlaceholder',
              )}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && send()}
              className="border-border bg-surface text-fg focus:border-accent h-8 w-full min-w-0 flex-1 rounded-md border px-2.5 text-sm outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              className="bg-accent text-on-accent grid h-8 w-8 shrink-0 place-items-center rounded-md disabled:opacity-40"
              aria-label={t(said ? 'demo.commentsReply' : 'commands.comment')}
              title={t(said ? 'demo.commentsReply' : 'commands.comment')}
            >
              <Icon name="send" size={16} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** A card's menu button: the comment commands for the selected thread. */
function CardMenuButton() {
  const more = useCommand('menu:comment-item');
  if (!more.visible) return null;
  return <CommandButton cmd={more} variant="icon" run={() => void more.run()} />;
}

function Reply({ dto, writing }: { dto: Annotation; writing: boolean }) {
  const t = useT();
  return (
    <div className="border-border-subtle ms-1 border-s-2 ps-2">
      <div className="flex items-baseline gap-2">
        <span className="text-fg-secondary text-xs font-medium">
          {dto.author ?? t('demo.commentsAnonymous')}
        </span>
        <span className="text-fg-muted text-[11px]">
          {dateLabel(dto.modifiedAt ?? dto.createdAt)}
        </span>
      </div>
      <CommentBody annotationRef={dto.ref} text={dto.contents ?? ''} deletable writing={writing} />
    </div>
  );
}

/** One comment's text with inline edit (own, unlocked) and delete (replies), while people write. */
function CommentBody({
  annotationRef,
  text,
  deletable,
  writing,
}: {
  annotationRef: AnnotationRef;
  text: string;
  deletable: boolean;
  writing: boolean;
}) {
  const t = useT();
  const comments = useComments();
  const perms = {
    canEditText: writing && comments.canSetText(annotationRef),
    canDelete: writing && comments.canDelete(annotationRef),
  };
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const save = () => {
      const next = draft.trim();
      setDraft(null);
      if (next && next !== text) void comments.setText(annotationRef, next);
    };
    return (
      <textarea
        value={draft}
        autoFocus
        rows={2}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            save();
          }
          if (event.key === 'Escape') setDraft(null);
        }}
        className="border-accent bg-surface text-fg w-full resize-none rounded-md border px-2 py-1 text-sm outline-none"
      />
    );
  }
  // No text yet: the card's box writes it.
  if (!text && !deletable) return null;
  return (
    <div className="group/body flex items-start gap-1">
      <p className="text-fg min-w-0 flex-1 whitespace-pre-wrap text-sm">{text}</p>
      {perms.canEditText && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setDraft(text);
          }}
          className="text-fg-muted hover:text-fg grid h-5 w-5 shrink-0 place-items-center rounded opacity-0 group-hover/body:opacity-100"
          title={t('demo.commentsEdit')}
        >
          <Icon name="pencilMarker" size={12} />
        </button>
      )}
      {deletable && perms.canDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void comments.delete(annotationRef);
          }}
          className="text-fg-muted hover:text-fg grid h-5 w-5 shrink-0 place-items-center rounded opacity-0 group-hover/body:opacity-100"
          title={t('demo.commentsDelete')}
        >
          <Icon name="trash" size={12} />
        </button>
      )}
    </div>
  );
}

function statusLabel(t: ReturnType<typeof useT>, state: string): string {
  const key = REVIEW_STATE_LABEL_KEYS[state];
  return key ? t(key) : state; // custom vocabularies render verbatim
}

/** The comments said in a thread: its annotation's text, when it has one, and each reply. */
function commentCountOf(view: CommentThreadView): number {
  return (view.root.contents?.trim() ? 1 : 0) + view.replies.length;
}

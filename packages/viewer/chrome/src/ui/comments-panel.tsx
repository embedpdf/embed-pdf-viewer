import { useEffect, useMemo, useRef, useState } from 'react';
import { useCapability } from '@embedpdf/react/runtime';
import {
  AnnotationToken,
  refKey,
  useAnnotationSelection,
  useComments,
  useCommentThreads,
  useCommentsHydration,
  type AnnotationDTO,
  type AnnotationRef,
  type CommentThreadView,
} from '@embedpdf/react/annotation';
import { StageToken } from '@embedpdf/react/stage';
import { useT } from '@embedpdf/react/i18n';
import { Icon } from './icons';
import { commentIconAccent, commentTypeConfig } from './comment-config';

/**
 * The comments sidebar (right panel): a live view over the conversation
 * plane, in the shape v2's reviewers knew — page-grouped sections, and a
 * card that identifies its annotation at a glance by the type's glyph tinted
 * with that annotation's own colors. What v2 lacked, and this adds, is the
 * ISO 32000 §12.5.6.3 review status per thread.
 *
 * There is no per-page loading dance: the plugin hydrates the WHOLE document
 * at open (`listRawAll`), so the list is complete the moment `hydration()`
 * says so, whether or not a page was ever scrolled to.
 *
 * Selection is two-way, as in v2: clicking a card selects the annotation and
 * flies the camera to it (`stage.reveal`, the same verb search hits use);
 * selecting in the document scrolls that card into view here.
 *
 * Every action routes through the `comments` verbs — plain annotation writes
 * on the one optimistic pipeline — and every control is gated by
 * `permissionsFor`, the engine's own collab-resolver mirrors: what shows here
 * is what the engine will allow.
 */

const REVIEW_STATES = ['none', 'accepted', 'rejected', 'cancelled', 'completed'] as const;

const dateLabel = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function CommentsPanel() {
  const t = useT();
  const hydration = useCommentsHydration();
  const comments = useComments();
  const threads = useCommentThreads();
  const anno = useCapability(AnnotationToken);
  const stage = useCapability(StageToken);
  const selection = useAnnotationSelection();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});

  /** Which thread the document's selection points at — ANY member counts, so
   *  selecting a reply's parent shape highlights the same card. */
  const selectedThreadKey = useMemo(() => {
    for (const id of selection) {
      const dto = anno.getSelected().find((a) => refKey(a.ref) === id || a.nm === id);
      const ref = dto?.ref ?? null;
      const thread = ref ? comments.thread(ref) : null;
      if (thread) return refKey(thread.root.ref);
    }
    return null;
    // `selection` identity changes on every selection write — the right key.
  }, [selection, anno, comments]);

  // Reverse sync: the selected card scrolls itself into view (v2 centered it).
  useEffect(() => {
    if (!selectedThreadKey || !scrollRef.current) return;
    const el = cardRefs.current[selectedThreadKey];
    if (!el) return;
    const container = scrollRef.current;
    const top =
      el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2 - container.offsetTop;
    container.scrollTo({ top, behavior: 'smooth' });
  }, [selectedThreadKey]);

  /** Click a card: select the annotation AND fly the camera to it. */
  const goTo = (view: CommentThreadView) => {
    anno.select(view.root.ref);
    if (view.pageIndex < 0) return;
    // Anchor values are viewport FRACTIONS (0–1), not v2's percentages:
    // the annotation lands a third down the viewport, the find-bar feel.
    stage?.reveal(view.pageIndex, {
      ...(view.contentRect ? { rect: view.contentRect } : {}),
      anchor: { x: 'center', y: 0.35 },
      behavior: 'smooth',
    });
  };

  // Page-grouped, preserving the lens's display order within each page.
  const byPage = useMemo(() => {
    const groups = new Map<number, CommentThreadView[]>();
    for (const v of threads) {
      const arr = groups.get(v.pageIndex);
      if (arr) arr.push(v);
      else groups.set(v.pageIndex, [v]);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [threads]);

  if (hydration.status === 'loading') return <Empty icon="comment" text={t('demo.commentsLoading')} />;
  if (hydration.status === 'error') {
    return (
      <Empty icon="alertTriangle" text={t('demo.commentsError')}>
        <button
          type="button"
          onClick={() => void comments.rehydrate()}
          className="bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm font-medium"
        >
          {t('demo.commentsRetry')}
        </button>
      </Empty>
    );
  }
  if (threads.length === 0) return <Empty icon="comment" text={t('demo.commentsEmpty')} />;

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-5 p-3">
        {byPage.map(([pageIndex, group]) => (
          <div key={pageIndex} className="flex flex-col gap-2">
            <div className="bg-surface sticky top-0 z-10">
              <div className="border-border-subtle border-b pb-1.5">
                <h3 className="text-fg text-sm font-semibold">
                  {t('demo.commentsPage', { params: { page: group[0]!.pageLabel } })}
                </h3>
                <p className="text-fg-muted text-xs">
                  {t(group.length === 1 ? 'demo.commentCount' : 'demo.commentCountPlural', {
                    params: { count: String(group.length) },
                  })}
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {group.map((view) => {
                const key = refKey(view.root.ref);
                return (
                  <ThreadCard
                    key={key}
                    view={view}
                    selected={selectedThreadKey === key}
                    onSelect={() => goTo(view)}
                    cardRef={(el) => {
                      cardRefs.current[key] = el;
                    }}
                  />
                );
              })}
            </ul>
          </div>
        ))}
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
  selected,
  onSelect,
  cardRef,
}: {
  view: CommentThreadView;
  selected: boolean;
  onSelect: () => void;
  cardRef: (el: HTMLLIElement | null) => void;
}) {
  const t = useT();
  const comments = useComments();
  const [reply, setReply] = useState('');
  const perms = comments.permissionsFor(view.root.ref);
  const config = commentTypeConfig(view.root);
  const status = view.review.mine?.state ?? 'none';
  const latest = view.review.lastChange;

  const sendReply = () => {
    const text = reply.trim();
    if (!text) return;
    setReply('');
    void comments.reply(view.root.ref, text);
  };

  return (
    <li
      ref={cardRef}
      onClick={onSelect}
      className={`bg-surface cursor-pointer rounded-lg border shadow-sm transition-all hover:shadow-md ${
        selected ? 'border-accent ring-accent/40 ring-2' : 'border-border-subtle'
      }`}
    >
      <div className="flex flex-col gap-2 p-3">
        {/* identity row: the annotation's own glyph + color is the anchor */}
        <div className="flex items-start gap-2.5">
          <div
            className="bg-hover mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
            title={t(config.labelKey, { fallback: config.label })}
          >
            <Icon name={config.icon} size={18} accent={commentIconAccent(view.root)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-fg truncate text-sm font-medium">
                {view.root.author ?? t('demo.commentsAnonymous')}
              </span>
              <span className="text-fg-muted ml-auto shrink-0 text-xs">
                {dateLabel(view.root.modified ?? view.root.created)}
              </span>
            </div>
            {latest && (
              <span className="bg-accent-light text-accent mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium">
                {statusLabel(t, latest.state)}
                {latest.by ? ` — ${latest.by}` : ''}
              </span>
            )}
          </div>
          {perms.canDeleteThread && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void comments.removeThread(view.root.ref);
              }}
              className="text-fg-muted hover:text-fg grid h-6 w-6 shrink-0 place-items-center rounded"
              title={t('demo.commentsDeleteThread')}
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>

        <CommentBody annotationRef={view.root.ref} text={view.root.contents ?? ''} deletable={false} />

        {view.replies.length > 0 && (
          <div className="border-border-subtle flex flex-col gap-2 border-t pt-2">
            {view.replies.map((r) => (
              <Reply key={refKey(r.ref)} dto={r} />
            ))}
          </div>
        )}

        <div className="border-border-subtle flex flex-col gap-1.5 border-t pt-2">
          {perms.canSetStatus && (
            <label
              className="text-fg-muted flex items-center gap-2 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              {t('demo.commentsStatus')}
              <select
                value={status}
                onChange={(e) => void comments.setStatus(view.root.ref, e.target.value)}
                className="border-border bg-surface text-fg flex-1 rounded-md border px-1.5 py-1 text-xs outline-none"
              >
                {REVIEW_STATES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(t, s)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {perms.canReply && (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={reply}
                placeholder={
                  view.root.contents || view.replies.length
                    ? t('demo.commentsReplyPlaceholder')
                    : t('demo.commentsAddPlaceholder')
                }
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                className="border-border bg-surface text-fg focus:border-accent w-full min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none"
              />
              <button
                type="button"
                onClick={sendReply}
                disabled={!reply.trim()}
                className="text-accent disabled:text-fg-muted grid h-7 w-7 shrink-0 place-items-center rounded-md"
                title={t('demo.commentsReply')}
              >
                <Icon name="arrowForwardUp" size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Reply({ dto }: { dto: AnnotationDTO }) {
  const t = useT();
  return (
    <div className="border-border-subtle ml-1 border-l-2 pl-2">
      <div className="flex items-baseline gap-2">
        <span className="text-fg-secondary text-xs font-medium">
          {dto.author ?? t('demo.commentsAnonymous')}
        </span>
        <span className="text-fg-muted text-[11px]">
          {dateLabel(dto.modified ?? dto.created)}
        </span>
      </div>
      <CommentBody annotationRef={dto.ref} text={dto.contents ?? ''} deletable />
    </div>
  );
}

/** One comment's text with inline edit (own, unlocked) and delete (replies). */
function CommentBody({
  annotationRef,
  text,
  deletable,
}: {
  annotationRef: AnnotationRef;
  text: string;
  deletable: boolean;
}) {
  const t = useT();
  const comments = useComments();
  const perms = comments.permissionsFor(annotationRef);
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const save = () => {
      const next = draft.trim();
      setDraft(null);
      if (next && next !== text) void comments.edit(annotationRef, next);
    };
    return (
      <textarea
        value={draft}
        autoFocus
        rows={2}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') setDraft(null);
        }}
        className="border-accent bg-surface text-fg w-full resize-none rounded-md border px-2 py-1 text-sm outline-none"
      />
    );
  }
  if (!text && !perms.canEditText && !deletable) return null;
  return (
    <div className="group/body flex items-start gap-1">
      <p className="text-fg min-w-0 flex-1 whitespace-pre-wrap text-sm">{text}</p>
      {perms.canEditText && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
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
          onClick={(e) => {
            e.stopPropagation();
            void comments.remove(annotationRef);
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
  switch (state) {
    case 'none':
      return t('demo.commentsStatusNone');
    case 'accepted':
      return t('demo.commentsStatusAccepted');
    case 'rejected':
      return t('demo.commentsStatusRejected');
    case 'cancelled':
      return t('demo.commentsStatusCancelled');
    case 'completed':
      return t('demo.commentsStatusCompleted');
    default:
      return state; // custom vocabularies render verbatim
  }
}

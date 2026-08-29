import { useState } from 'react';
import { useCapability } from '@embedpdf/react/runtime';
import {
  AnnotationToken,
  refKey,
  useComments,
  useCommentThreads,
  useCommentsHydration,
  type AnnotationRef,
  type CommentThreadView,
} from '@embedpdf/react/annotation';
import { useT } from '@embedpdf/react/i18n';
import { Icon } from './icons';

/**
 * The comments sidebar (right panel): a live view over the conversation
 * plane. There is no per-page loading dance — the plugin hydrates the WHOLE
 * document at open (`listRawAll`), so the list is complete the moment
 * `hydration()` reports it, whether or not any page was ever scrolled to.
 *
 * Every action routes through the `comments` verbs — plain annotation
 * writes on the one optimistic pipeline (remote SSE echoes update the same
 * list) — and every control is gated by `permissionsFor`, the engine's own
 * collab-resolver mirrors: what shows here is what the engine will allow.
 */

const REVIEW_STATES = ['none', 'accepted', 'rejected', 'cancelled', 'completed'] as const;

const dateLabel = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

export function CommentsPanel() {
  const t = useT();
  const hydration = useCommentsHydration();
  const comments = useComments();
  const threads = useCommentThreads();

  if (hydration.status === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <Icon name="comment" size={32} className="text-fg-muted" />
        <p className="text-fg-muted text-sm">{t('demo.commentsLoading')}</p>
      </div>
    );
  }
  if (hydration.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <Icon name="alertTriangle" size={32} className="text-fg-muted" />
        <p className="text-fg-muted text-sm">{t('demo.commentsError')}</p>
        <button
          type="button"
          onClick={() => void comments.rehydrate()}
          className="bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm font-medium"
        >
          {t('demo.commentsRetry')}
        </button>
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <Icon name="comment" size={32} className="text-fg-muted" />
        <p className="text-fg-muted text-sm">{t('demo.commentsEmpty')}</p>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <ul className="flex flex-col gap-2">
        {threads.map((view) => (
          <ThreadCard key={refKey(view.root.ref)} view={view} />
        ))}
      </ul>
    </div>
  );
}

function ThreadCard({ view }: { view: CommentThreadView }) {
  const t = useT();
  const comments = useComments();
  const anno = useCapability(AnnotationToken);
  const [reply, setReply] = useState('');
  const perms = comments.permissionsFor(view.root.ref);
  const status = view.review.mine?.state ?? 'none';

  const sendReply = () => {
    const text = reply.trim();
    if (!text) return;
    setReply('');
    void comments.reply(view.root.ref, text);
  };

  return (
    <li className="border-border-subtle rounded-lg border">
      {/* header: author + page + date, thread delete */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => anno.select(view.root.ref)}
        onKeyDown={(e) => e.key === 'Enter' && anno.select(view.root.ref)}
        className="hover:bg-hover group flex cursor-pointer items-start gap-2 rounded-t-lg px-2.5 pb-1 pt-2"
      >
        <Icon name="comment" size={16} className="text-fg-muted mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-fg truncate text-sm font-medium">
              {view.root.author ?? t('demo.commentsAnonymous')}
            </span>
            <span className="text-fg-muted shrink-0 text-xs">
              {t('demo.pageBadge', { params: { page: view.pageLabel } })}
            </span>
            <span className="text-fg-muted ml-auto shrink-0 text-xs">
              {dateLabel(view.root.created)}
            </span>
          </div>
          {view.review.lastChange && (
            <span className="bg-accent-light text-accent mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium">
              {statusLabel(t, view.review.lastChange.state)}
              {view.review.lastChange.by ? ` — ${view.review.lastChange.by}` : ''}
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
            className="text-fg-muted hover:text-fg grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100"
            title={t('demo.commentsDeleteThread')}
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>

      {/* root text + replies */}
      <div className="flex flex-col gap-1.5 px-2.5 pb-2">
        <CommentBody refId={view.root.ref} text={view.root.contents ?? ''} deletable={false} />
        {view.replies.map((r) => (
          <div key={refKey(r.ref)} className="border-border-subtle ml-1 border-l-2 pl-2">
            <div className="flex items-baseline gap-2">
              <span className="text-fg-secondary text-xs font-medium">
                {r.author ?? t('demo.commentsAnonymous')}
              </span>
              <span className="text-fg-muted text-[11px]">{dateLabel(r.created)}</span>
            </div>
            <CommentBody refId={r.ref} text={r.contents ?? ''} deletable />
          </div>
        ))}
      </div>

      {/* actions: status + reply */}
      <div className="border-border-subtle flex flex-col gap-1.5 border-t px-2.5 py-2">
        {perms.canSetStatus && (
          <label className="text-fg-muted flex items-center gap-2 text-xs">
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
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={reply}
              placeholder={t('demo.commentsReplyPlaceholder')}
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
    </li>
  );
}

/** One comment's text with inline edit (own, unlocked) and delete (replies). */
function CommentBody({
  refId,
  text,
  deletable,
}: {
  refId: AnnotationRef;
  text: string;
  deletable: boolean;
}) {
  const t = useT();
  const comments = useComments();
  const perms = comments.permissionsFor(refId);
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const save = () => {
      const next = draft.trim();
      setDraft(null);
      if (next && next !== text) void comments.edit(refId, next);
    };
    return (
      <textarea
        value={draft}
        autoFocus
        rows={2}
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
  return (
    <div className="group/body flex items-start gap-1">
      <p className="text-fg min-w-0 flex-1 whitespace-pre-wrap text-sm">{text}</p>
      {perms.canEditText && (
        <button
          type="button"
          onClick={() => setDraft(text)}
          className="text-fg-muted hover:text-fg grid h-5 w-5 shrink-0 place-items-center rounded opacity-0 group-hover/body:opacity-100"
          title={t('demo.commentsEdit')}
        >
          <Icon name="pencilMarker" size={12} />
        </button>
      )}
      {deletable && perms.canDelete && (
        <button
          type="button"
          onClick={() => void comments.remove(refId)}
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

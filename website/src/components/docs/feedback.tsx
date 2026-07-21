'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type { FeedbackPayload, FeedbackReason, FeedbackSite } from '@/lib/docs-feedback';

const POSITIVE_OPTIONS: Array<{ value: FeedbackReason; label: string }> = [
  { value: 'clear', label: 'Clear explanation' },
  { value: 'example_worked', label: 'Example worked' },
  { value: 'found_answer', label: 'Found what I needed' },
];

const NEGATIVE_OPTIONS: Array<{ value: FeedbackReason; label: string }> = [
  { value: 'missing_information', label: 'Missing information' },
  { value: 'example_failed', label: "Example didn't work" },
  { value: 'unclear', label: 'Unclear' },
  { value: 'outdated', label: 'Out of date' },
  { value: 'could_not_find', label: "Couldn't find it" },
];

type FeedbackOption = (typeof POSITIVE_OPTIONS)[number];

type StoredFeedback = {
  id: string;
  picked: 'yes' | 'no';
};

type FeedbackProps = {
  site: FeedbackSite;
  sectionId: string | null;
  revision: string;
  variant?: 'compact' | 'full';
  className?: string;
};

function createFeedbackId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ThumbIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === 'up' ? (
        <>
          <path d="M7 10v12" />
          <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" />
        </>
      ) : (
        <>
          <path d="M17 14V2" />
          <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z" />
        </>
      )}
    </svg>
  );
}

type FeedbackDetailsDialogProps = {
  picked: 'yes' | 'no';
  options: FeedbackOption[];
  reasons: FeedbackReason[];
  comment: string;
  company: string;
  requestState: 'idle' | 'saving' | 'saved' | 'error';
  onToggleReason: (reason: FeedbackReason) => void;
  onCommentChange: (comment: string) => void;
  onCompanyChange: (company: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

function FeedbackDetailsDialog({
  picked,
  options,
  reasons,
  comment,
  company,
  requestState,
  onToggleReason,
  onCommentChange,
  onCompanyChange,
  onSubmit,
  onClose,
}: FeedbackDetailsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = `feedback-details-title-${picked}`;
  const descriptionId = `feedback-details-description-${picked}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();

      const returnFocus = returnFocusRef.current;
      if (returnFocus && document.contains(returnFocus)) {
        requestAnimationFrame(() => returnFocus.focus());
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="border-ep-border fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[520px] overflow-hidden rounded-[18px] border bg-white p-0 shadow-[0_28px_80px_rgba(7,32,76,0.28)] backdrop:bg-[rgba(7,32,76,0.48)] backdrop:backdrop-blur-[4px]"
    >
      <form onSubmit={onSubmit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="border-ep-border flex items-start gap-4 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-ep-navy text-lg font-bold">
              Share more detail
            </h2>
            <p id={descriptionId} className="text-ep-soft mt-1 font-sans text-sm leading-5">
              {picked === 'yes'
                ? 'You said this page was helpful. What worked well?'
                : 'You said this page was not helpful. What should we improve?'}
              <span className="text-ep-subtle ml-1">Optional</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback dialog"
            className="text-ep-subtle hover:bg-ep-mist hover:text-ep-navy -mr-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-sans text-2xl leading-none transition-colors"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          <div className="text-ep-navy font-sans text-[13px] font-bold">
            {picked === 'yes' ? 'What worked well?' : 'What could be better?'}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={reasons.includes(option.value)}
                onClick={() => onToggleReason(option.value)}
                className={`rounded-full border px-3 py-2 font-sans text-xs font-semibold leading-4 transition-colors ${
                  reasons.includes(option.value)
                    ? 'border-ep-blue bg-ep-mist text-ep-blue'
                    : 'border-ep-border text-ep-soft hover:text-ep-blue bg-white hover:border-[#CFE0FF]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="text-ep-soft mt-5 block font-sans text-[13px] font-semibold">
            Tell us more
            <textarea
              value={comment}
              maxLength={1000}
              rows={4}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder="What should we improve?"
              className="border-ep-border text-ep-ink placeholder:text-ep-subtle focus:border-ep-blue mt-2 block w-full resize-y rounded-[10px] border bg-white px-3.5 py-3 font-sans text-sm font-normal leading-5 outline-none"
            />
          </label>
          <p className="text-ep-subtle mt-2 font-sans text-[11px] leading-4">
            Please don&apos;t include secrets or personal information.
          </p>

          <label className="absolute -left-[10000px]" aria-hidden="true">
            Company
            <input
              name="company"
              value={company}
              tabIndex={-1}
              autoComplete="off"
              onChange={(event) => onCompanyChange(event.target.value)}
            />
          </label>

          {requestState === 'error' && (
            <p className="mt-4 font-sans text-xs font-semibold text-[#B42318]" role="alert">
              We couldn&apos;t save your vote yet. Please try again.
            </p>
          )}
        </div>

        <footer className="border-ep-border flex flex-col-reverse gap-2 border-t bg-[#FAFBFC] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="border-ep-border text-ep-soft hover:text-ep-navy rounded-[9px] border bg-white px-4 py-2.5 font-sans text-sm font-semibold"
          >
            Not now
          </button>
          <button
            type="submit"
            disabled={requestState === 'saving' || (reasons.length === 0 && !comment.trim())}
            className="bg-ep-blue rounded-[9px] px-4 py-2.5 font-sans text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
          >
            {requestState === 'saving' ? 'Sending…' : 'Send details'}
          </button>
        </footer>

        <span className="sr-only" aria-live="polite">
          {requestState === 'saving' ? 'Sending feedback.' : ''}
        </span>
      </form>
    </dialog>
  );
}

export function Feedback({
  site,
  sectionId,
  revision,
  variant = 'compact',
  className = '',
}: FeedbackProps) {
  const pathname = usePathname();
  const storageKey = useMemo(
    () => `docs-feedback:${site}:${revision}:${pathname}`,
    [pathname, revision, site],
  );
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [picked, setPicked] = useState<'yes' | 'no' | null>(null);
  const [sectionAtVote, setSectionAtVote] = useState<string | null>(null);
  const [reasons, setReasons] = useState<FeedbackReason[]>([]);
  const [comment, setComment] = useState('');
  const [company, setCompany] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [requestState, setRequestState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setFeedbackId(null);
    setPicked(null);
    setSectionAtVote(null);
    setReasons([]);
    setComment('');
    setDetailsOpen(false);
    setRequestState('idle');

    try {
      const stored = JSON.parse(
        localStorage.getItem(storageKey) ?? 'null',
      ) as StoredFeedback | null;
      if (stored?.id && (stored.picked === 'yes' || stored.picked === 'no')) {
        setFeedbackId(stored.id);
        setPicked(stored.picked);
        setRequestState('saved');
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const options = picked === 'yes' ? POSITIVE_OPTIONS : NEGATIVE_OPTIONS;
  const isCompact = variant === 'compact';

  async function persistFeedback(
    id: string,
    choice: 'yes' | 'no',
    selectedReasons: FeedbackReason[],
    writtenComment: string,
    capturedSection: string | null,
  ) {
    setRequestState('saving');

    const payload: FeedbackPayload = {
      id,
      site,
      path: pathname,
      sectionId: capturedSection,
      helpful: choice === 'yes',
      reasons: selectedReasons,
      comment: writtenComment.trim() || null,
      company,
    };

    try {
      const response = await fetch('/api/docs/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Feedback request failed.');

      localStorage.setItem(storageKey, JSON.stringify({ id, picked: choice }));
      setRequestState('saved');
      return true;
    } catch {
      setRequestState('error');
      return false;
    }
  }

  async function chooseFeedback(choice: 'yes' | 'no') {
    if (choice === picked && requestState === 'saved') {
      setSectionAtVote((current) => current ?? sectionId);
      setDetailsOpen(true);
      return;
    }

    const id = feedbackId ?? createFeedbackId();
    const capturedSection = sectionId;

    setFeedbackId(id);
    setPicked(choice);
    setSectionAtVote(capturedSection);
    setReasons([]);
    setComment('');
    setDetailsOpen(true);
    await persistFeedback(id, choice, [], '', capturedSection);
  }

  function toggleReason(reason: FeedbackReason) {
    setReasons((current) => {
      if (current.includes(reason)) return current.filter((item) => item !== reason);
      if (current.length >= 3) return current;
      return [...current, reason];
    });
  }

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked) return;

    const id = feedbackId ?? createFeedbackId();
    setFeedbackId(id);
    const saved = await persistFeedback(id, picked, reasons, comment, sectionAtVote ?? sectionId);
    if (saved) setDetailsOpen(false);
  }

  const issueBody = `Documentation page: ${pathname}${sectionAtVote ? `#${sectionAtVote}` : ''}\n\nWhat happened?\n`;
  const issueUrl = `https://github.com/embedpdf/embed-pdf-viewer/issues/new?title=${encodeURIComponent(`Docs: issue on ${pathname}`)}&body=${encodeURIComponent(issueBody)}`;

  return (
    <section
      aria-labelledby={`feedback-title-${variant}`}
      className={`${
        isCompact
          ? 'border-ep-border mt-[26px] border-t pt-[22px]'
          : 'border-ep-border mt-14 max-w-[70ch] rounded-2xl border bg-white p-5 shadow-[0_16px_40px_-32px_rgba(7,32,76,0.35)] sm:p-6'
      } ${className}`}
    >
      <div
        id={`feedback-title-${variant}`}
        className={`font-display text-ep-navy font-bold leading-[1.4] ${
          isCompact ? 'mb-[11px] text-[13px]' : 'text-base'
        }`}
      >
        Was this page helpful?
      </div>
      {!isCompact && (
        <p className="text-ep-soft mb-4 mt-1 font-sans text-sm leading-6">
          Your feedback goes directly to the documentation team.
        </p>
      )}

      <div className="flex gap-2">
        {(['yes', 'no'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={picked === value}
            disabled={requestState === 'saving'}
            onClick={() => void chooseFeedback(value)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] border font-sans text-[13px] font-bold transition-colors disabled:cursor-wait disabled:opacity-65 ${
              picked === value
                ? 'border-ep-blue bg-ep-mist text-ep-blue'
                : 'border-ep-border text-ep-soft hover:text-ep-blue bg-white hover:border-[#CFE0FF] hover:bg-[#F4F8FF]'
            }`}
          >
            <ThumbIcon direction={value === 'yes' ? 'up' : 'down'} />
            {value === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>

      {picked && detailsOpen && (
        <FeedbackDetailsDialog
          picked={picked}
          options={options}
          reasons={reasons}
          comment={comment}
          company={company}
          requestState={requestState}
          onToggleReason={toggleReason}
          onCommentChange={setComment}
          onCompanyChange={setCompany}
          onSubmit={(event) => void submitDetails(event)}
          onClose={() => setDetailsOpen(false)}
        />
      )}

      {picked && !detailsOpen && requestState === 'saved' && (
        <div className="mt-3">
          <p className="text-ep-blue font-sans text-xs font-semibold" role="status">
            Thanks — your feedback was recorded.
          </p>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="text-ep-soft hover:text-ep-blue mt-1 font-sans text-[11.5px] font-semibold underline underline-offset-2"
          >
            Add more detail
          </button>
        </div>
      )}

      {requestState === 'error' && (
        <div className="mt-3" role="alert">
          <p className="font-sans text-xs font-semibold text-[#B42318]">
            We couldn&apos;t save this yet.
          </p>
          {picked && (
            <button
              type="button"
              onClick={() =>
                void persistFeedback(
                  feedbackId ?? createFeedbackId(),
                  picked,
                  reasons,
                  comment,
                  sectionAtVote ?? sectionId,
                )
              }
              className="text-ep-blue mt-1 font-sans text-xs font-bold"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {picked === 'no' && (
        <a
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ep-soft hover:text-ep-blue mt-3 inline-flex font-sans text-[11.5px] font-semibold underline underline-offset-2"
        >
          Is this a product bug? Report it on GitHub
        </a>
      )}

      <span className="sr-only" aria-live="polite">
        {requestState === 'saving' ? 'Sending feedback.' : ''}
      </span>
    </section>
  );
}

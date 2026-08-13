'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  HIGHLIGHT_CLOSE,
  HIGHLIGHT_OPEN,
  type DocsSearchHit,
  type DocsSearchResponse,
} from './search/types';

/** Long enough that a stalled keystroke does not fire a query of its own. */
const DEBOUNCE_MS = 140;

export type SearchDialogProduct = { value: string; label: string };

function SearchGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChevronGlyph({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-[var(--dk-border)] bg-white px-1.5 font-mono text-[11px] font-semibold text-[var(--dk-muted)] shadow-[0_1px_0_rgba(14,26,64,0.06)]">
      {children}
    </kbd>
  );
}

/** Occupies the icon slot while a query is in flight, so the field itself
 *  reports progress instead of leaving the reader to watch the list. */
function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle cx="10" cy="10" r="7.75" stroke="var(--dk-border)" strokeWidth="2.25" />
      <path
        d="M17.75 10A7.75 7.75 0 0 0 10 2.25"
        stroke="var(--dk-accent)"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClearIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Renders the excerpt's highlight sentinels as real elements. The markers are
 * invisible Unicode isolates rather than HTML, so nothing here has to trust
 * the string it was handed.
 */
function Excerpt({ text }: { text: string }) {
  const parts = useMemo(() => {
    const pattern = new RegExp(`${HIGHLIGHT_OPEN}(.*?)${HIGHLIGHT_CLOSE}`, 'gs');
    const nodes: { value: string; highlighted: boolean }[] = [];
    let cursor = 0;

    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      if (start > cursor) nodes.push({ value: text.slice(cursor, start), highlighted: false });
      nodes.push({ value: match[1], highlighted: true });
      cursor = start + match[0].length;
    }
    if (cursor < text.length) nodes.push({ value: text.slice(cursor), highlighted: false });
    return nodes;
  }, [text]);

  return (
    <span className="block font-sans text-[13px] leading-snug text-[var(--dk-muted)]">
      {parts.map((part, index) =>
        part.highlighted ? (
          <mark key={index} className="bg-transparent font-semibold text-[var(--dk-heading)]">
            {part.value}
          </mark>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </span>
  );
}

function ResultRow({
  hit,
  active,
  onHover,
  onSelect,
}: {
  hit: DocsSearchHit;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const trail = [...hit.breadcrumb, hit.pageTitle].join(' › ');

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-3 px-[18px] py-2.5 text-left transition-colors duration-100 ${
        active ? 'bg-[var(--dk-accent-surface)]' : 'bg-transparent'
      }`}
    >
      <div className="min-w-0 flex-1">
        <span className="font-display block text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--dk-muted)]">
          {trail}
        </span>
        <b className="block font-sans text-sm font-semibold text-[var(--dk-heading)]">
          {hit.sectionTitle ?? hit.pageTitle}
        </b>
        {hit.excerpt ? <Excerpt text={hit.excerpt} /> : null}
      </div>
      <ChevronGlyph size={14} className="flex-shrink-0 text-[var(--dk-muted)]" />
    </button>
  );
}

export type SearchDialogProps = {
  onClose: () => void;
  /** Product filter chips; omit (or []) to hide the chip row. */
  products?: SearchDialogProduct[];
  placeholder?: string;
  /** The site's search endpoint. */
  apiPath?: string;
  /** Copy under the empty state, naming what this site's search covers. */
  emptyHint?: string;
};

/**
 * The shared docs search dialog — one view on both sites, riding the
 * `--dk-*` token contract.
 *
 * Always rendered through a portal: site headers tend to carry a
 * `backdrop-filter`, which would otherwise become the containing block for
 * this dialog's `fixed inset-0` overlay and clip it to the header strip.
 */
export function SearchDialog({
  onClose,
  products = [],
  placeholder = 'Search the docs…',
  apiPath = '/api/search',
  emptyHint = 'Search guides, plugins, and API names.',
}: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState<string | null>(null);
  const [response, setResponse] = useState<DocsSearchResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = response?.hits ?? [];

  const open = useCallback(
    (hit: DocsSearchHit | undefined) => {
      if (!hit) return;
      router.push(hit.url);
      onClose();
    },
    [router, onClose],
  );

  // One in-flight request at a time: a slow response for an older prefix must
  // never overwrite results the reader is already looking at.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResponse(null);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (product) params.set('product', product);

        const result = await fetch(`${apiPath}?${params}`, { signal: controller.signal });
        if (!result.ok) throw new Error(`Search failed (${result.status})`);

        setResponse((await result.json()) as DocsSearchResponse);
        setStatus('ready');
        setActive(0);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setStatus('error');
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, product, apiPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose();
      if (hits.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((index) => (index + 1) % hits.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => (index - 1 + hits.length) % hits.length);
      } else if (event.key === 'Enter') {
        // This listener is on `window`, so it would otherwise swallow Enter for
        // every focusable control in the dialog — tabbing to Clear or a product
        // chip and pressing Enter would open a result instead of pressing the
        // button. A focused button owns its own Enter.
        if (document.activeElement instanceof HTMLButtonElement) return;
        event.preventDefault();
        open(hits[active]);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, hits, active, open]);

  // Keyboard navigation has to drag the viewport with it. The lookup is held
  // in a local rather than chained: Prettier breaks a chained `[active]` onto
  // its own line, which trips `no-unexpected-multiline` (ASI ambiguity).
  useEffect(() => {
    const options = listRef.current?.querySelectorAll('[role="option"]');
    options?.[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return createPortal(
    <div
      className="dk-anim-fade fixed inset-0 z-[1000] flex items-start justify-center bg-[rgba(7,32,76,0.45)] px-5 pb-5 pt-[clamp(40px,10vh,120px)] backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="dk-anim-slide flex max-h-[70vh] w-full max-w-[580px] flex-col overflow-hidden rounded-[14px] border border-[var(--dk-border)] bg-white shadow-[0_20px_60px_rgba(7,32,76,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* The field carries no focus ring of its own: it is autofocused and is
            the only text input in the dialog, so a ring restates what the caret
            already says. The accent caret is the focus signal instead. */}
        <div className="flex h-[62px] flex-shrink-0 items-center gap-3 border-b border-[var(--dk-border)] px-[18px]">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
            {status === 'loading' ? (
              <Spinner />
            ) : (
              <SearchGlyph
                size={20}
                className={`transition-colors duration-150 ${
                  query ? 'text-[var(--dk-accent)]' : 'text-[var(--dk-muted)]'
                }`}
              />
            )}
          </span>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="search-results"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-ring="none"
            className="min-w-0 flex-1 border-none bg-transparent font-sans text-[17px] font-medium tracking-[-0.01em] text-[var(--dk-heading)] caret-[var(--dk-accent)] outline-none placeholder:text-[var(--dk-muted)]"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="inline-flex h-[22px] w-[22px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--dk-muted)] transition-colors duration-150 hover:bg-[var(--dk-accent-surface)] hover:text-[var(--dk-heading)]"
            >
              <ClearIcon />
            </button>
          ) : null}
        </div>

        {products.length > 0 ? (
          <div className="flex gap-1.5 border-b border-[var(--dk-border)] px-[18px] py-2">
            {[null, ...products.map((entry) => entry.value)].map((value) => (
              <button
                key={value ?? 'all'}
                type="button"
                onClick={() => setProduct(value)}
                className={`rounded-full px-2.5 py-1 font-sans text-xs font-semibold transition-colors ${
                  product === value
                    ? 'bg-[var(--dk-heading)] text-white'
                    : 'bg-[var(--dk-accent-surface)] text-[var(--dk-muted)] hover:text-[var(--dk-heading)]'
                }`}
              >
                {value ? products.find((entry) => entry.value === value)?.label : 'All'}
              </button>
            ))}
          </div>
        ) : null}

        <div id="search-results" role="listbox" ref={listRef} className="flex-1 overflow-y-auto py-2">
          {status === 'idle' && (
            <p className="px-6 py-10 text-center font-sans text-sm font-medium text-[var(--dk-muted)]">
              {emptyHint}
            </p>
          )}
          {status === 'error' && (
            <p className="px-6 py-10 text-center font-sans text-sm font-medium text-[var(--dk-muted)]">
              Search is temporarily unavailable.
            </p>
          )}
          {status !== 'idle' && status !== 'error' && hits.length === 0 && (
            <p className="px-6 py-10 text-center font-sans text-sm font-medium text-[var(--dk-muted)]">
              {status === 'loading' ? 'Searching…' : `No results for “${query.trim()}”`}
            </p>
          )}
          {hits.map((hit, index) => (
            <ResultRow
              key={`${hit.contentPath}#${hit.anchor ?? ''}`}
              hit={hit}
              active={index === active}
              onHover={() => setActive(index)}
              onSelect={() => open(hit)}
            />
          ))}
        </div>

        <div className="flex gap-4 border-t border-[var(--dk-border)] bg-[#FAFBFC] px-[18px] py-2.5 font-sans text-xs font-medium text-[var(--dk-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> Navigate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>⏎</Kbd> Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>ESC</Kbd> Close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

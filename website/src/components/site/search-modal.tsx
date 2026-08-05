'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ChevronRightIcon, SearchIcon } from './icons';

import {
  HIGHLIGHT_CLOSE,
  HIGHLIGHT_OPEN,
  type DocsSearchHit,
  type DocsSearchResponse,
} from '@/lib/search/types';

/** Long enough that a stalled keystroke does not fire a query of its own. */
const DEBOUNCE_MS = 140;

const PRODUCT_LABELS: Record<string, string> = {
  viewer: 'Viewer',
  headless: 'Headless',
  engine: 'Engine',
};

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="border-ep-borderSoft inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border bg-white px-1.5 font-mono text-[11px] font-semibold text-[#3D4E75] shadow-[0_1px_0_rgba(14,26,64,0.06)]">
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
      <circle cx="10" cy="10" r="7.75" stroke="#DCE8FC" strokeWidth="2.25" />
      <path
        d="M17.75 10A7.75 7.75 0 0 0 10 2.25"
        stroke="#0876FD"
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
    <span className="text-ep-subtle block font-sans text-[13px] leading-snug">
      {parts.map((part, index) =>
        part.highlighted ? (
          <mark key={index} className="text-ep-navy bg-transparent font-semibold">
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
        active ? 'bg-ep-tint' : 'bg-transparent'
      }`}
    >
      <div className="min-w-0 flex-1">
        <span className="font-display text-ep-subtle block text-[11px] font-bold uppercase tracking-[0.06em]">
          {trail}
        </span>
        <b className="text-ep-navy block font-sans text-sm font-semibold">
          {hit.sectionTitle ?? hit.pageTitle}
        </b>
        {hit.excerpt ? <Excerpt text={hit.excerpt} /> : null}
      </div>
      <ChevronRightIcon size={14} className="flex-shrink-0 text-[#3D4E75]" />
    </button>
  );
}

export function SearchModal({ onClose }: { onClose: () => void }) {
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

        const result = await fetch(`/api/search?${params}`, { signal: controller.signal });
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
  }, [query, product]);

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

  // Keyboard navigation has to drag the viewport with it. The lookup is held in
  // a local rather than chained: Prettier breaks a chained `[active]` onto its
  // own line, which trips `no-unexpected-multiline` (ASI ambiguity) and fails
  // the build.
  useEffect(() => {
    const options = listRef.current?.querySelectorAll('[role="option"]');
    options?.[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // The header this modal is mounted under carries a `backdrop-filter`, which
  // makes it the containing block for every fixed descendant — rendered in
  // place, the overlay would size itself to the 84px header strip instead of
  // the viewport, and only that strip would dim or take an outside click.
  // Portal past the header so `inset-0` means the viewport again.
  return createPortal(
    <div
      className="ep-anim-fade fixed inset-0 z-[1000] flex items-start justify-center bg-[rgba(7,32,76,0.45)] px-5 pb-5 pt-[clamp(40px,10vh,120px)] backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="ep-anim-slide border-ep-borderSoft flex max-h-[70vh] w-full max-w-[580px] flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_20px_60px_rgba(7,32,76,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* The field carries no focus ring of its own: it is autofocused and is
            the only text input in the dialog, so a ring restates what the caret
            already says, and the site-wide one collapses onto the text of a
            padding-less input. The blue caret is the focus signal instead.
            `data-ring="none"` is the opt-out — that global rule is unlayered
            and no `outline-none` utility can override it. */}
        <div className="border-ep-borderSoft flex h-[62px] flex-shrink-0 items-center gap-3 border-b px-[18px]">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
            {status === 'loading' ? (
              <Spinner />
            ) : (
              <SearchIcon
                size={20}
                className={`transition-colors duration-150 ${query ? 'text-ep-blue' : 'text-ep-subtle'}`}
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
            placeholder="Search the docs…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-ring="none"
            className="text-ep-navy placeholder:text-ep-subtle caret-ep-blue min-w-0 flex-1 border-none bg-transparent font-sans text-[17px] font-medium tracking-[-0.01em] outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="text-ep-subtle hover:bg-ep-mist hover:text-ep-navy inline-flex h-[22px] w-[22px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150"
            >
              <ClearIcon />
            </button>
          ) : null}
        </div>

        <div className="border-ep-borderSoft flex gap-1.5 border-b px-[18px] py-2">
          {[null, 'viewer', 'headless', 'engine'].map((value) => (
            <button
              key={value ?? 'all'}
              type="button"
              onClick={() => setProduct(value)}
              className={`rounded-full px-2.5 py-1 font-sans text-xs font-semibold transition-colors ${
                product === value
                  ? 'bg-ep-navy text-white'
                  : 'bg-ep-mist text-ep-subtle hover:text-ep-navy'
              }`}
            >
              {value ? PRODUCT_LABELS[value] : 'All'}
            </button>
          ))}
        </div>

        <div
          id="search-results"
          role="listbox"
          ref={listRef}
          className="flex-1 overflow-y-auto py-2"
        >
          {status === 'idle' && (
            <p className="text-ep-subtle px-6 py-10 text-center font-sans text-sm font-medium">
              Search guides, plugins, and API names.
            </p>
          )}
          {status === 'error' && (
            <p className="text-ep-subtle px-6 py-10 text-center font-sans text-sm font-medium">
              Search is temporarily unavailable.
            </p>
          )}
          {status !== 'idle' && status !== 'error' && hits.length === 0 && (
            <p className="text-ep-subtle px-6 py-10 text-center font-sans text-sm font-medium">
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

        <div className="border-ep-borderSoft text-ep-subtle flex gap-4 border-t bg-[#FAFBFC] px-[18px] py-2.5 font-sans text-xs font-medium">
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

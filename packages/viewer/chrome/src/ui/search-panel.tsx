/**
 * Search's two surfaces on the plugin-search capability: the search panel, a
 * sidebar that lists each hit with its snippet, and the find bar, which opens
 * in its place when hits come without snippets (panels.tsx). One shape end to
 * end: the flat `SearchQuery` {text, regex, matchCase, wholeWord} is what the
 * engine matches, what the plugin stores (document-scoped, survives either
 * closing), and what both boxes render. Each keeps only a draft of it for
 * keystroke/debounce echo.
 *
 * Data flow:
 *   type / toggle → validateSearchQuery → (debounced) search(draftQuery)
 *   Enter → the draft at once, else the next hit; Shift+Enter → the previous one
 *   useSearchState() → query / status / hitCount / activeHitIndex (reactive)
 *   useSearchHits() → the streamed hit list (the panel's)
 *   click a hit / prev / next → goTo/prev/next (capability reveals it on-page)
 *
 * matchDiacritics exists in the engine but is deliberately not exposed here.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  useSearch,
  useSearchHits,
  useSearchState,
  validateSearchQuery,
} from '@embedpdf/react/search';
import type { SearchHit, SearchQuery, SearchSnippet } from '@embedpdf/react/search';
import { useT } from '@embedpdf/react/i18n';
import { useSurfaceFocus } from '@embedpdf/react/shell';
import { Icon } from './icons';
import { useCloseOnPick } from './panel-frame';
import { buttonClass } from './toolbar';

const DEBOUNCE_MS = 300;

/** Field-wise equality on the flat query — the mount/echo no-op guard. */
const sameQuery = (left: SearchQuery | null, right: SearchQuery) =>
  left != null &&
  left.text === right.text &&
  !!left.regex === !!right.regex &&
  !!left.matchCase === !!right.matchCase &&
  !!left.wholeWord === !!right.wholeWord;

// ── the draft both surfaces type into ────────────────────────────────────────

/**
 * A search box's draft: the text and the three toggles, checked as they change and sent once
 * typing pauses. It starts from the stored query; each surface is keyed on the document
 * (panels.tsx), so this one-time seed is always the right document's query.
 */
function useSearchDraft() {
  const search = useSearch();
  const state = useSearchState();
  const { query } = state;
  const [draft, setDraft] = useState(() => query?.text ?? '');
  const [matchCase, setMatchCase] = useState(() => query?.matchCase ?? false);
  const [wholeWord, setWholeWord] = useState(() => query?.wholeWord ?? false);
  const [regex, setRegex] = useState(() => query?.regex ?? false);

  // The draft is a SearchQuery — same shape the engine matches on.
  const draftQuery: SearchQuery = { text: draft, regex, matchCase, wholeWord };
  // Early feedback on keystroke: the same validator the engine enforces
  // (regex dialect). Invalid patterns never fire a query.
  const validation = draft && regex ? validateSearchQuery(draftQuery) : { ok: true as const };
  // Nothing to send: an invalid pattern, the draft already the stored query (the mount pass, or
  // our own echo coming back through state), or an empty box with nothing stored to clear.
  const waiting =
    validation.ok && !sameQuery(query, draftQuery) && !(draft === '' && query === null);

  // Clearing the box clears results.
  useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => search.search(draftQuery), DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, matchCase, wholeWord, regex, query, waiting, search]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (waiting) void search.search(draftQuery);
    else if (event.shiftKey) search.previousHit();
    else search.nextHit();
  };

  return {
    search,
    state,
    draft,
    setDraft,
    matchCase,
    setMatchCase,
    wholeWord,
    setWholeWord,
    regex,
    setRegex,
    validation,
    onKeyDown,
  };
}

type SearchDraft = ReturnType<typeof useSearchDraft>;

// ── the field and its options ────────────────────────────────────────────────

/** The input: a magnifier, a clear button, and red while the pattern is invalid. */
function SearchField({ box }: { box: SearchDraft }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  // Find and the Search button ask for the cursor: it goes in the field, the text selected.
  useSurfaceFocus('search', inputRef, { select: true });
  return (
    <div className="relative min-w-0 flex-1">
      <div className="text-fg-muted pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5">
        <Icon name="search" size={16} />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={box.draft}
        placeholder={t('demo.searchPlaceholder')}
        onChange={(event) => box.setDraft(event.target.value)}
        onKeyDown={box.onKeyDown}
        className={`bg-surface text-fg w-full rounded-md border py-1.5 pe-9 ps-8 text-sm outline-none focus:ring-1 ${
          box.validation.ok
            ? 'border-border focus:border-accent focus:ring-accent'
            : 'border-red-400 focus:border-red-400 focus:ring-red-400'
        }`}
      />
      {box.draft && (
        <button
          type="button"
          onClick={() => {
            box.setDraft('');
            inputRef.current?.focus();
          }}
          className="text-fg-muted hover:text-fg-secondary absolute inset-y-0 end-0 flex items-center pe-2.5"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

/** The invalid-pattern message, straight from the shared validator. */
function InvalidPattern({ box }: { box: SearchDraft }) {
  if (box.validation.ok) return null;
  return <p className="mt-1.5 text-xs text-red-500">{box.validation.message}</p>;
}

// ── option checkbox (a peer-checked custom box) ───────────────────────────────
function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="text-fg-secondary flex cursor-pointer select-none items-center gap-2 text-xs font-medium">
      <span className="relative flex h-4 w-4 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="border-border bg-surface checked:border-accent checked:bg-accent rounded-xs peer h-4 w-4 shrink-0 appearance-none border transition-colors"
        />
        <svg
          viewBox="0 0 24 24"
          className="text-on-accent pointer-events-none absolute h-3 w-3 opacity-0 peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      {label}
    </label>
  );
}

/** The three options, all composable: match case, whole word, regular expression. */
function SearchOptions({ box, className }: { box: SearchDraft; className: string }) {
  const t = useT();
  return (
    <div className={className}>
      <Checkbox
        label={t('demo.searchCaseSensitive')}
        checked={box.matchCase}
        onChange={box.setMatchCase}
      />
      <Checkbox
        label={t('demo.searchWholeWord')}
        checked={box.wholeWord}
        onChange={box.setWholeWord}
      />
      <Checkbox label={t('demo.searchRegex')} checked={box.regex} onChange={box.setRegex} />
    </div>
  );
}

/** Previous and next: the search's hits in turn, wrapping. */
function HitSteps({ box, disabled = false }: { box: SearchDraft; disabled?: boolean }) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        title={t('demo.searchPrevious')}
        aria-label={t('demo.searchPrevious')}
        disabled={disabled}
        className={buttonClass(false, !disabled)}
        onClick={() => box.search.previousHit()}
      >
        <Icon name="chevronLeft" size={20} className="rtl:-scale-x-100" />
      </button>
      <button
        type="button"
        title={t('demo.searchNext')}
        aria-label={t('demo.searchNext')}
        disabled={disabled}
        className={buttonClass(false, !disabled)}
        onClick={() => box.search.nextHit()}
      >
        <Icon name="chevronRight" size={20} className="rtl:-scale-x-100" />
      </button>
    </div>
  );
}

// ── one result row: a snippet with the match bolded, active = accented ───────
function renderSnippet(snippet: SearchSnippet) {
  return (
    <>
      {snippet.before}
      <span className="text-accent font-semibold">{snippet.match}</span>
      {snippet.after}
    </>
  );
}

function HitLine({
  hit,
  index,
  active,
  onClick,
}: {
  hit: SearchHit;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  // Keep the active hit visible as prev/next walks the list.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`w-full rounded border p-2 text-left text-sm transition-colors ${
        active
          ? 'border-accent bg-accent-light text-fg'
          : 'border-border-subtle bg-surface text-fg-secondary hover:bg-hover'
      }`}
    >
      {/* A hit the engine found no text around reads as its place among the results. */}
      <span>
        {hit.snippet
          ? renderSnippet(hit.snippet)
          : t('demo.searchResult', { params: { index: index + 1 } })}
      </span>
    </button>
  );
}

// ── the panel ────────────────────────────────────────────────────────────────

/**
 * The search panel: the field, the option checkboxes, a results-found counter with prev/next,
 * and a per-page grouped snippet list with the match bolded and the active hit accented, in
 * this app's semantic tokens.
 */
export function SearchPanel() {
  const t = useT();
  const box = useSearchDraft();
  const { status, hitCount, activeHitIndex } = box.state;
  const hits = useSearchHits();
  // A sheet or an overlay closes once a match is picked, so you see it on its page.
  const closeOnPick = useCloseOnPick();

  // Group hits by page, preserving page order, for the sectioned list.
  const grouped = useMemo(() => {
    const map = new Map<number, { hit: SearchHit; index: number }[]>();
    hits.forEach((hit, index) => {
      const arr = map.get(hit.pageIndex);
      if (arr) arr.push({ hit, index });
      else map.set(hit.pageIndex, [{ hit, index }]);
    });
    return [...map.entries()].sort((left, right) => left[0] - right[0]);
  }, [hits]);

  const searching = status === 'searching';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <SearchField box={box} />
        <InvalidPattern box={box} />
        <SearchOptions box={box} className="mt-3 flex flex-col gap-2" />

        <hr className="border-border-subtle mb-2 mt-4" />

        {/* results counter + prev/next */}
        {status !== 'idle' && (
          <div className="flex h-8 items-center justify-between">
            <div className="text-fg-muted text-xs">
              {hitCount === 0
                ? t(searching ? 'demo.searchSearching' : 'demo.searchNoResults')
                : t('demo.searchResults', { params: { count: hitCount } })}
            </div>
            {hitCount > 1 && <HitSteps box={box} />}
          </div>
        )}
      </div>

      {/* per-page grouped results */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {grouped.map(([pageIndex, items]) => (
          <div key={pageIndex} className="mt-2 first:mt-0">
            <div className="bg-surface/80 text-fg-muted py-2 text-xs backdrop-blur">
              {t('demo.searchPage', { params: { page: pageIndex + 1 } })}
            </div>
            <div className="flex flex-col gap-2">
              {items.map(({ hit, index }) => (
                <HitLine
                  key={index}
                  hit={hit}
                  index={index}
                  active={index === activeHitIndex}
                  onClick={() => {
                    box.search.goToHit(index);
                    closeOnPick();
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── the find bar ─────────────────────────────────────────────────────────────

/**
 * The find bar: the field, which hit is active of how many, prev/next, and the options behind a
 * toggle, open from the start while one of them is on. It lists nothing: it is for hits that
 * come without their text.
 */
export function FindBar() {
  const t = useT();
  const box = useSearchDraft();
  const { status, hitCount, activeHitIndex } = box.state;
  const [optionsOpen, setOptionsOpen] = useState(() => box.matchCase || box.wholeWord || box.regex);

  const counter =
    status === 'idle'
      ? null
      : hitCount === 0
        ? t(status === 'searching' ? 'demo.searchSearching' : 'demo.searchNoResults')
        : t('demo.searchHitOf', { params: { current: activeHitIndex + 1, total: hitCount } });

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <SearchField box={box} />
        {counter !== null && (
          <span className="text-fg-muted shrink-0 whitespace-nowrap px-1 text-xs tabular-nums">
            {counter}
          </span>
        )}
        <HitSteps box={box} disabled={hitCount === 0} />
        <button
          type="button"
          title={t('demo.searchOptions')}
          aria-label={t('demo.searchOptions')}
          aria-expanded={optionsOpen}
          className={buttonClass(optionsOpen)}
          onClick={() => setOptionsOpen((open) => !open)}
        >
          <Icon name="chevronDown" size={20} />
        </button>
      </div>
      <InvalidPattern box={box} />
      {optionsOpen && (
        <SearchOptions box={box} className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 px-1 pb-1" />
      )}
    </div>
  );
}

/**
 * The search panel — the v2 snippet's search sidebar on the v3 plugin-search
 * capability. ONE shape end to end: the flat `SearchQuery` {text, regex,
 * matchCase, wholeWord} is what the engine matches, what the plugin stores
 * (document-scoped, survives the sidebar closing), and what this box renders.
 * The panel keeps only a DRAFT of it for keystroke/debounce echo.
 *
 * Data flow:
 *   type / toggle → validateSearchQuery → (debounced) search(draftQuery)
 *   useSearchState() → query / status / hitCount / activeIndex (reactive)
 *   useSelector(SearchToken, c => c.hits()) → the streamed hit list
 *   click a hit / prev / next → goTo/prev/next (capability reveals it on-page)
 *
 * The look is ported 1:1 from viewers/snippet's search-sidebar (magnifier
 * input with clear button, option checkboxes, results-found counter with
 * prev/next, per-page grouped snippet list with the match bolded and the
 * active hit accented), retinted to this app's semantic tokens. The regex
 * toggle is new in v3 (v2 had no pattern search); matchDiacritics exists in
 * the engine but is deliberately not exposed here — v2 parity.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useSearch,
  useSearchState,
  validateSearchQuery,
  SearchToken,
} from '@embedpdf/react/search';
import type { SearchHit, SearchQuery, SearchSnippet } from '@embedpdf/react/search';
import { useSelector } from '@embedpdf/react/runtime';
import { useT } from '@embedpdf/react/i18n';
import { Icon } from './icons';
import { buttonClass } from './toolbar';

const DEBOUNCE_MS = 300;

/** Field-wise equality on the flat query — the mount/echo no-op guard. */
const sameQuery = (a: SearchQuery | null, b: SearchQuery) =>
  a != null &&
  a.text === b.text &&
  !!a.regex === !!b.regex &&
  !!a.matchCase === !!b.matchCase &&
  !!a.wholeWord === !!b.wholeWord;

// ── option checkbox (v2's peer-checked custom box) ───────────────────────────
function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="text-fg-secondary flex cursor-pointer select-none items-center gap-2 text-xs font-medium">
      <span className="relative flex h-4 w-4 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="border-border bg-surface checked:border-accent checked:bg-accent peer h-4 w-4 shrink-0 appearance-none rounded-[3px] border transition-colors"
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

// ── one result row: a snippet with the match bolded, active = accented ───────
function renderSnippet(s: SearchSnippet | undefined) {
  if (!s) return null;
  const end = s.matchStart + s.matchLength;
  return (
    <>
      {s.text.slice(0, s.matchStart)}
      <span className="text-accent font-semibold">{s.text.slice(s.matchStart, end)}</span>
      {s.text.slice(end)}
    </>
  );
}

function HitLine({
  hit,
  active,
  onClick,
}: {
  hit: SearchHit;
  active: boolean;
  onClick: () => void;
}) {
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
      <span>{renderSnippet(hit.snippet)}</span>
    </button>
  );
}

// ── the panel ────────────────────────────────────────────────────────────────
export function SearchPanel() {
  const t = useT();
  const search = useSearch();
  const { query, status, hitCount, activeIndex } = useSearchState();
  const hits = useSelector(SearchToken, (c) => c.hits());

  // `query` is the document-scoped stored search (survives the sidebar
  // closing). The box is a controlled draft that STARTS from it; the panel is
  // keyed on the document (see panels.tsx), so this one-time seed is always
  // the right document's query — switching tabs remounts and reseeds.
  const [draft, setDraft] = useState(() => query?.text ?? '');
  const [matchCase, setMatchCase] = useState(() => query?.matchCase ?? false);
  const [wholeWord, setWholeWord] = useState(() => query?.wholeWord ?? false);
  const [regex, setRegex] = useState(() => query?.regex ?? false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The draft IS a SearchQuery — same shape the engine matches on.
  const draftQuery: SearchQuery = { text: draft, regex, matchCase, wholeWord };
  // Early feedback on keystroke: the same validator the engine enforces
  // (regex dialect). Invalid patterns never fire a query.
  const validation = draft && regex ? validateSearchQuery(draftQuery) : { ok: true as const };

  // Debounced query. The sameQuery guard makes the mount pass (and our own
  // echo coming back through state) a no-op — nothing re-runs until the user
  // actually changes the text or a toggle. Clearing the box clears results.
  useEffect(() => {
    // No-ops: invalid pattern, draft already the stored query (mount pass /
    // our own echo), or an empty box with nothing stored to clear.
    if (!validation.ok || sameQuery(query, draftQuery)) return;
    if (draft === '' && query === null) return;
    const id = setTimeout(() => search.search(draftQuery), DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, matchCase, wholeWord, regex, query, validation.ok, search]);

  // Group hits by page, preserving page order, for the sectioned list.
  const grouped = useMemo(() => {
    const map = new Map<number, { hit: SearchHit; index: number }[]>();
    hits.forEach((hit, index) => {
      const arr = map.get(hit.pageIndex);
      if (arr) arr.push({ hit, index });
      else map.set(hit.pageIndex, [{ hit, index }]);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [hits]);

  const searching = status === 'searching';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        {/* input: magnifier + clear */}
        <div className="relative">
          <div className="text-fg-muted pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
            <Icon name="search" size={16} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            placeholder={t('demo.searchPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            className={`bg-surface text-fg w-full rounded-md border py-1.5 pl-8 pr-9 text-sm outline-none focus:ring-1 ${
              validation.ok
                ? 'border-border focus:border-accent focus:ring-accent'
                : 'border-red-400 focus:border-red-400 focus:ring-red-400'
            }`}
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft('');
                inputRef.current?.focus();
              }}
              className="text-fg-muted hover:text-fg-secondary absolute inset-y-0 right-0 flex items-center pr-2.5"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        {/* the invalid-pattern message, straight from the shared validator */}
        {!validation.ok && <p className="mt-1.5 text-xs text-red-500">{validation.message}</p>}

        {/* options — the three VS Code toggles, all composable */}
        <div className="mt-3 flex flex-col gap-2">
          <Checkbox
            label={t('demo.searchCaseSensitive')}
            checked={matchCase}
            onChange={setMatchCase}
          />
          <Checkbox label={t('demo.searchWholeWord')} checked={wholeWord} onChange={setWholeWord} />
          <Checkbox label={t('demo.searchRegex')} checked={regex} onChange={setRegex} />
        </div>

        <hr className="border-border-subtle mb-2 mt-4" />

        {/* results counter + prev/next */}
        {status !== 'idle' && (
          <div className="flex h-8 items-center justify-between">
            <div className="text-fg-muted text-xs">
              {hitCount === 0
                ? t(searching ? 'demo.searchSearching' : 'demo.searchNoResults')
                : t('demo.searchResults', { params: { count: hitCount } })}
            </div>
            {hitCount > 1 && (
              <div className="flex items-center">
                <button
                  type="button"
                  title="Previous"
                  className={buttonClass(false)}
                  onClick={() => search.prev()}
                >
                  <Icon name="chevronLeft" size={20} />
                </button>
                <button
                  type="button"
                  title="Next"
                  className={buttonClass(false)}
                  onClick={() => search.next()}
                >
                  <Icon name="chevronRight" size={20} />
                </button>
              </div>
            )}
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
                  active={index === activeIndex}
                  onClick={() => search.goTo(index)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

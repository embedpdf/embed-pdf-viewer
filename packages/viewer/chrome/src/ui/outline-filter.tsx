/**
 * The outline's filter: the text the outline panel finds items by, and the field it's typed in,
 * the `outline-filter` item of the panel's bar. The bar and the panel's rows share the text
 * through {@link OutlineFilterScope}, which keeps one text per document.
 */
import { useT } from '@embedpdf/react/i18n';
import { useDocumentId } from '@embedpdf/react/runtime';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { Icon } from './icons';

/** The filter text, and what changes it. */
type OutlineFilter = readonly [text: string, setText: (text: string) => void];

const OutlineFilterContext = createContext<OutlineFilter | null>(null);

/** Holds the outline panel's filter text, for its bar and its rows: each document's own. */
export function OutlineFilterScope({ children }: { children: ReactNode }) {
  const documentId = useDocumentId() ?? '';
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(() => new Map());
  const setText = useCallback(
    (text: string) => setTexts((previous) => new Map(previous).set(documentId, text)),
    [documentId],
  );
  const text = texts.get(documentId) ?? '';
  const filter = useMemo<OutlineFilter>(() => [text, setText], [text, setText]);
  return <OutlineFilterContext.Provider value={filter}>{children}</OutlineFilterContext.Provider>;
}

const NO_FILTER: OutlineFilter = ['', () => {}];

/** The outline panel's filter text and what changes it; outside the panel, an empty one. */
export function useOutlineFilter(): OutlineFilter {
  return useContext(OutlineFilterContext) ?? NO_FILTER;
}

/** The filter's field, as wide as the bar has room for: `'wide'`, or `'narrow'`. Nothing outside the panel. */
export function OutlineFilterField({ variant }: { variant: string }) {
  const t = useT();
  const filter = useContext(OutlineFilterContext);
  if (!filter) return null;
  const [text, setText] = filter;
  return (
    <div className={`relative ${variant === 'narrow' ? 'w-24' : 'w-36'}`}>
      <div className="text-fg-muted pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2">
        <Icon name="search" size={14} />
      </div>
      <input
        type="search"
        value={text}
        placeholder={t('outline.filter')}
        aria-label={t('outline.filter')}
        onChange={(event) => setText(event.target.value)}
        className="border-border bg-surface text-fg focus:border-accent focus:ring-accent w-full rounded-md border py-1 pe-2 ps-7 text-sm outline-none focus:ring-1"
      />
    </div>
  );
}

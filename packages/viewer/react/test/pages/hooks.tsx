/**
 * Headless hooks inside the viewer: a search box of the app's own, in a toolbar item, that
 * uses `useSearch()` and `useSearchState()` from the app's own `@embedpdf/react` against the
 * viewer's kernel, and the document's title in the footer, from `useMetadataState()`.
 * `hooks.test.ts` drives it.
 */
import { createRoot } from 'react-dom/client';
import { useMetadataState } from '@embedpdf/react/metadata';
import { SearchToken, useSearch, useSearchState } from '@embedpdf/react/search';
import {
  PDFViewer,
  Region,
  SearchToken as ViewerSearchToken,
  ToolbarItem,
} from '@embedpdf/viewer-react';
import type { LayoutFunction, Viewer } from '@embedpdf/viewer-react';

import { checkRecord } from './check';

export interface HooksRecord {
  viewer: Viewer | null;
  /** Whether the app's `SearchToken` is the viewer's: one copy of the plugin. */
  sameToken: boolean;
  SearchToken: typeof SearchToken;
  /** Each metadata load state the footer's title showed, in order. */
  metadataStatuses: string[];
}

const record = checkRecord<HooksRecord>({
  viewer: null,
  sameToken: SearchToken === ViewerSearchToken,
  SearchToken,
  metadataStatuses: [],
});

/** The document's title, read with the app's own hook: reading it is what loads it. */
function DocumentTitle() {
  const { metadata, status } = useMetadataState();
  if (record.metadataStatuses.at(-1) !== status) record.metadataStatuses.push(status);
  return (
    <output data-check="title" data-status={status}>
      {status === 'ready' ? (metadata?.title ?? '') : 'Loading…'}
    </output>
  );
}

function AppSearch() {
  const search = useSearch();
  const { hitCount, activeHitIndex, status } = useSearchState();
  return (
    <span data-check="search" data-status={status}>
      <input
        data-check="query"
        type="search"
        placeholder="Search (app)"
        onChange={(event) => void search.search({ text: event.target.value })}
      />
      <output data-check="hits">{hitCount}</output>
      <output data-check="active">{activeHitIndex}</output>
      <button type="button" data-check="next" onClick={() => search.nextHit()}>
        Next
      </button>
    </span>
  );
}

const layout: LayoutFunction = (base) =>
  base.add(
    { custom: 'app-search', command: 'panel:search', importance: 5 },
    { to: 'main', section: 'start', group: 'app' },
  );

createRoot(document.getElementById('root')!).render(
  <PDFViewer
    src="/sample.pdf"
    layout={layout}
    style={{ height: '100vh', display: 'block' }}
    onReady={(viewer) => {
      record.viewer = viewer;
    }}
  >
    <ToolbarItem id="app-search">
      <AppSearch />
    </ToolbarItem>
    <Region name="footer">
      <DocumentTitle />
    </Region>
  </PDFViewer>,
);

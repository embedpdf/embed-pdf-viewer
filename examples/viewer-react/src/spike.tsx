/**
 * Headless hooks inside the full viewer: a search box of the app's own, slotted
 * into a toolbar socket, that uses `useSearch()` and `useSearchState()` from
 * the app's own `@embedpdf/react` against the viewer's kernel.
 *
 * Built by `vite.spike.config.ts`; `test/spike-hooks.mjs` drives it.
 */
import { SearchToken, useSearch, useSearchState } from '@embedpdf/react/search';
import { PDFViewer, SearchToken as ViewerSearchToken } from '@embedpdf/viewer-react';
import type { ChromeHelpers, ChromeSchema, ViewerHandle } from '@embedpdf/viewer-react';
import { createRoot } from 'react-dom/client';
import './index.css';

function SpikeSearch(props: { slot?: string }) {
  const search = useSearch();
  const { hitCount, activeHitIndex, status } = useSearchState();
  return (
    <span className="doc-status" data-spike="search" data-status={status} {...props}>
      <input
        data-spike="query"
        type="search"
        placeholder="Search (app)"
        onChange={(event) => void search.search({ text: event.target.value })}
      />
      <output data-spike="hits">{hitCount}</output>
      <output data-spike="active">{activeHitIndex}</output>
      <button type="button" data-spike="next" onClick={() => search.nextHit()}>
        Next
      </button>
    </span>
  );
}

const chrome = (base: ChromeSchema, h: ChromeHelpers): ChromeSchema =>
  h.addItem(base, {
    bar: 'main',
    section: 'start',
    group: 'spike',
    item: h.custom('spike-search', 'panel:search', { importance: 5 }),
  });

declare global {
  interface Window {
    spike?: { viewer: ViewerHandle; sameToken: boolean; SearchToken: typeof SearchToken };
  }
}

function App() {
  return (
    <PDFViewer
      src="/testlab.pdf"
      chrome={chrome}
      style={{ height: '100vh', display: 'block' }}
      onReady={(viewer) => {
        window.spike = { viewer, sameToken: SearchToken === ViewerSearchToken, SearchToken };
      }}
    >
      <SpikeSearch slot="spike-search" />
    </PDFViewer>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

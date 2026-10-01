import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  SearchLayer,
  searchPlugin,
  useSearch,
  useSearchHits,
  useSearchState,
} from '@embedpdf/react/search';
import { localEngine } from '@embedpdf/engine';

import './results-list.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function SearchBox() {
  const search = useSearch();
  const hitCount = useSearchState((state) => state.hitCount);
  const [text, setText] = useState('PDF');

  useEffect(() => {
    void search.search({ text });
  }, [search, text]);

  return (
    <div className="toolbar">
      <input
        className="field"
        type="search"
        aria-label="Search"
        placeholder="Search…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <output className="readout">{hitCount} matches</output>
    </div>
  );
}

// Every match with the words around it. Clicking one makes it the active match and scrolls to it.
function Results() {
  const search = useSearch();
  const hits = useSearchHits();
  const activeHitIndex = useSearchState((state) => state.activeHitIndex);

  return (
    <ol className="results">
      {hits.map((hit, index) => (
        <li key={`${hit.page.objectNumber}:${hit.start}`}>
          <button
            type="button"
            className="result"
            aria-current={index === activeHitIndex}
            onClick={() => search.goToHit(index)}
          >
            <span className="result-page">Page {hit.pageIndex + 1}</span>
            {/* A match has no snippet when the user may search but not copy text. */}
            {hit.snippet && (
              <span className="result-text">
                …{hit.snippet.before}
                <mark>{hit.snippet.match}</mark>
                {hit.snippet.after}…
              </span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SearchBox />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <SearchLayer />
              </>
            )}
          </Stage>
          <Results />
        </div>
      </DocumentGate>
    </Viewer>
  );
}

import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchState } from '@embedpdf/react/search';
import { cloudEngine } from '@cloudpdf/engine';

import './basic.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function SearchBox() {
  const search = useSearch();
  const { hitCount, activeHitIndex, status } = useSearchState();
  const [text, setText] = useState('PDF');

  // Every change searches again, replacing the last search. An empty text clears it.
  useEffect(() => {
    void search.search({ text });
  }, [search, text]);

  let count = '';
  if (hitCount > 0) count = `${activeHitIndex + 1} of ${hitCount}`;
  else if (status === 'searching') count = 'Searching…';
  else if (status === 'complete') count = 'No matches';

  return (
    <div className="toolbar">
      <input
        className="field"
        type="search"
        aria-label="Search"
        placeholder="Search…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          if (event.shiftKey) search.previousHit();
          else search.nextHit();
        }}
      />
      <output className="readout">{count}</output>
      <button
        type="button"
        className="button"
        aria-label="Previous match"
        disabled={hitCount === 0}
        onClick={() => search.previousHit()}
      >
        ↑
      </button>
      <button
        type="button"
        className="button"
        aria-label="Next match"
        disabled={hitCount === 0}
        onClick={() => search.nextHit()}
      >
        ↓
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SearchBox />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SearchLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

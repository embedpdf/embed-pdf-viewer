import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchState } from '@embedpdf/react/search';
import type { SearchQuery } from '@embedpdf/react/search';
import { cloudEngine } from '@cloudpdf/engine';

import './options.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function SearchWithOptions() {
  const search = useSearch();
  const hitCount = useSearchState((state) => state.hitCount);
  const [query, setQuery] = useState<SearchQuery>({
    text: 'pdf',
    matchCase: false,
    wholeWord: false,
  });

  // The text and the options are one query: changing either searches again.
  useEffect(() => {
    void search.search(query);
  }, [search, query]);

  return (
    <div className="toolbar">
      <input
        className="field"
        type="search"
        aria-label="Search"
        placeholder="Search…"
        value={query.text}
        onChange={(event) => setQuery({ ...query, text: event.target.value })}
      />
      <label className="option">
        <input
          type="checkbox"
          checked={query.matchCase}
          onChange={(event) => setQuery({ ...query, matchCase: event.target.checked })}
        />
        Match case
      </label>
      <label className="option">
        <input
          type="checkbox"
          checked={query.wholeWord}
          onChange={(event) => setQuery({ ...query, wholeWord: event.target.checked })}
        />
        Whole words
      </label>
      <output className="readout">{hitCount} matches</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SearchWithOptions />
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

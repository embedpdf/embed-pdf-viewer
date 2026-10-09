import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchState } from '@embedpdf/react/search';
import { cloudEngine } from '@cloudpdf/engine';

import './click-match.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Which match is the active one: the first on load, then the one you click.
function ActiveMatch() {
  const search = useSearch();
  const { hitCount, activeHitIndex } = useSearchState();

  useEffect(() => {
    void search.search({ text: 'PDF' });
  }, [search]);

  return (
    <div className="toolbar">
      <output className="readout">
        {hitCount > 0 ? `Match ${activeHitIndex + 1} of ${hitCount}` : 'Searching…'}
      </output>
      <span className="hint">Click a highlighted match to make it the active one.</span>
    </div>
  );
}

function Pages() {
  const search = useSearch();

  return (
    <Stage className="stage">
      {() => (
        <>
          <RenderLayer />
          <SearchLayer onHitClick={(hit) => search.goToHit(hit)} />
        </>
      )}
    </Stage>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ActiveMatch />
        <Pages />
      </DocumentGate>
    </Viewer>
  );
}

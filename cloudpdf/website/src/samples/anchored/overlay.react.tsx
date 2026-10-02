import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchState } from '@embedpdf/react/search';
import { Anchored } from '@embedpdf/react/anchored';
import { cloudEngine } from '@cloudpdf/engine';

import './overlay.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A button below the active match: it follows the match while you scroll and zoom.
function NextMatch() {
  const search = useSearch();
  const { activeHit, activeHitIndex, hitCount } = useSearchState();

  return (
    <Anchored
      anchor={activeHit && { page: activeHit.page, bounds: activeHit.bounds }}
      placement="bottom"
    >
      <button type="button" className="pill" onClick={() => search.nextHit()}>
        {activeHitIndex + 1} of {hitCount} · Next →
      </button>
    </Anchored>
  );
}

function Pages() {
  const search = useSearch();

  // Every "PDF" in the document, and the view on the first one.
  useEffect(() => {
    void search.search({ text: 'PDF' }).then(() => search.revealActiveHit());
  }, [search]);

  return (
    <Stage className="stage" overlay={<NextMatch />}>
      {() => (
        <>
          <RenderLayer />
          <SearchLayer />
        </>
      )}
    </Stage>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Pages />
      </DocumentGate>
    </Viewer>
  );
}

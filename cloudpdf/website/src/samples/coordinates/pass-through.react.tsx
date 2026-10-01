import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchHits } from '@embedpdf/react/search';
import { cloudEngine } from '@cloudpdf/engine';

import './pass-through.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A search hit says where it is in page coordinates; the Stage takes them as they are.
function Hits() {
  const search = useSearch();
  const stage = useStage();
  const hits = useSearchHits();

  useEffect(() => {
    void search.search({ text: 'PDF' });
  }, [search]);

  return (
    <ol className="hits">
      {hits.slice(0, 8).map((hit) =>
        hit.bounds ? (
          <li key={`${hit.page.objectNumber}:${hit.start}`}>
            <button
              type="button"
              className="hit"
              onClick={() => stage.reveal(hit.page, { rect: hit.bounds, anchor: { y: 0.35 } })}
            >
              <span className="where">page {hit.pageIndex + 1}</span>
              <code className="rect">
                x {Math.round(hit.bounds.x)}, y {Math.round(hit.bounds.y)}
              </code>
            </button>
          </li>
        ) : null,
      )}
    </ol>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="layout">
          <Hits />
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <SearchLayer />
              </>
            )}
          </Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}

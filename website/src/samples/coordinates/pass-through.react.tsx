import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchHits } from '@embedpdf/react/search';
import { localEngine } from '@embedpdf/engine';

import './pass-through.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

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

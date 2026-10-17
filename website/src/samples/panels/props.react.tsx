import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchHits } from '@embedpdf/react/search';
import { shellPlugin, useShell, useSurface } from '@embedpdf/react/shell';
import { localEngine } from '@embedpdf/engine';

import './props.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin(), shellPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The panel shows the match its props name, and steps to the next one without reopening.
function MatchPanel() {
  const panel = useSurface('match');
  const shell = useShell();
  const search = useSearch();
  const hits = useSearchHits();
  const index = typeof panel.props.index === 'number' ? panel.props.index : 0;
  const hit = hits[index];

  if (!panel.isOpen) return null;

  const show = (next: number) => {
    shell.updateSurfaceProps('match', { index: next });
    search.goToHit(hits[next]);
  };

  return (
    <aside className="panel" aria-label="Match">
      <header className="panel-header">
        <h3 className="panel-title">
          Match {index + 1} of {hits.length}
        </h3>
        <button type="button" className="close" aria-label="Close" onClick={panel.close}>
          ×
        </button>
      </header>
      {hit ? (
        <>
          <p className="page">Page {hit.pageIndex + 1}</p>
          {hit.snippet && (
            <p className="snippet">
              …{hit.snippet.before}
              <mark>{hit.snippet.match}</mark>
              {hit.snippet.after}…
            </p>
          )}
        </>
      ) : (
        <p className="page">Searching…</p>
      )}
      <div className="steps">
        <button
          type="button"
          className="button"
          disabled={index === 0}
          onClick={() => show(index - 1)}
        >
          ← Previous
        </button>
        <button
          type="button"
          className="button"
          disabled={index >= hits.length - 1}
          onClick={() => show(index + 1)}
        >
          Next →
        </button>
      </div>
    </aside>
  );
}

function Workspace() {
  const shell = useShell();
  const search = useSearch();
  const hits = useSearchHits();

  // Every "PDF" on the pages, and the first one open in the panel.
  useEffect(() => {
    void search.search({ text: 'PDF' });
    shell.open('match', { exclusive: 'right', props: { index: 0 } });
  }, [search, shell]);

  return (
    <div className="workspace">
      <Stage className="stage">
        {() => (
          <>
            <RenderLayer />
            {/* A click on a match opens it in the panel. */}
            <SearchLayer
              onHitClick={(hit) =>
                shell.open('match', { exclusive: 'right', props: { index: hits.indexOf(hit) } })
              }
            />
          </>
        )}
      </Stage>
      <MatchPanel />
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Workspace />
      </DocumentGate>
    </Viewer>
  );
}

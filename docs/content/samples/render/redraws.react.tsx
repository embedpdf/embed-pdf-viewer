import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin, useRender, useRenderEvent } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './redraws.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

interface Entry {
  id: number;
  text: string;
}

function Redraws() {
  const render = useRender();
  const currentPage = useStageState((state) => state.currentPage);
  const [entries, setEntries] = useState<Entry[]>([]);
  const count = useRef(0);

  useRenderEvent(
    (render) => render.onInvalidated,
    ({ pages, scope, origin }) => {
      const what = `${pages.length === 1 ? '1 page' : `${pages.length} pages`} · ${scope}`;
      const from = origin ? `an edit (${origin.kind})` : 'your code';
      const entry = { id: count.current++, text: `${what} · from ${from}` };
      setEntries((current) => [entry, ...current].slice(0, 4));
    },
  );

  // Redraw the first page on load, so there's something in the list.
  useEffect(() => render.invalidate({ pages: [0] }), [render]);

  // Changes whenever this page's pixels do: key your own long-lived renders on it.
  const epoch = currentPage ? render.getRenderEpoch(currentPage) : 0;

  return (
    <div className="panel">
      <div className="toolbar">
        <button
          type="button"
          className="button"
          disabled={!currentPage}
          onClick={() => currentPage && render.invalidate({ pages: [currentPage] })}
        >
          Redraw this page
        </button>
        <button
          type="button"
          className="button"
          disabled={!currentPage}
          onClick={() =>
            currentPage && render.invalidate({ pages: [currentPage], scope: 'annotations' })
          }
        >
          Only its annotations
        </button>
        <output className="badge">
          render epoch <strong>{epoch}</strong>
        </output>
      </div>
      <ol className="log" aria-live="polite">
        {entries.map((entry) => (
          <li key={entry.id} className="entry">
            <code>onInvalidated</code> {entry.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Redraws />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}

import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './navigation.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function PageToolbar() {
  const stage = useStage();
  const { currentPageIndex, pageCount } = useStageState();
  const [typed, setTyped] = useState('');

  // People count from 1, an index from 0. An index past the end goes to the last page.
  const jump = () => {
    const number = Number(typed);
    if (Number.isInteger(number) && number >= 1) stage.goToPage(number - 1);
    setTyped('');
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!stage.canGoPrevious()}
        onClick={() => stage.previousPage()}
      >
        ‹ Previous
      </button>
      <output className="badge">
        Page{' '}
        <strong>
          {currentPageIndex + 1} / {pageCount}
        </strong>
      </output>
      <button
        type="button"
        className="button"
        disabled={!stage.canGoNext()}
        onClick={() => stage.nextPage()}
      >
        Next ›
      </button>
      <input
        className="field"
        inputMode="numeric"
        aria-label="Go to page"
        placeholder="Go to page…"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && jump()}
      />
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PageToolbar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}

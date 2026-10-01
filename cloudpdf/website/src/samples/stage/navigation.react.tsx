import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePages } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './navigation.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function PageToolbar() {
  const { currentPage, pageCount, goToPage, next, previous } = usePages();
  const [typed, setTyped] = useState('');
  const jump = () => {
    const n = Number(typed);
    if (n >= 1 && n <= pageCount) goToPage(n - 1); // goToPage counts from 0
    setTyped('');
  };
  return (
    <div className="toolbar">
      <button type="button" className="button" onClick={() => previous()}>
        ‹ Previous
      </button>
      <output className="badge">
        Page{' '}
        <strong>
          {currentPage + 1} / {pageCount}
        </strong>
      </output>
      <button type="button" className="button" onClick={() => next()}>
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

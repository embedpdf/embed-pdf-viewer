import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePages } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function PageToolbar() {
  const { currentPage, pageCount, goToPage, next, prev } = usePages();
  const [typed, setTyped] = useState('');
  const jump = () => {
    const n = Number(typed);
    if (n >= 1 && n <= pageCount) goToPage(n - 1); // goToPage counts from 0
    setTyped('');
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
      <button onClick={() => prev()}>‹ Previous</button>
      <span>
        Page {currentPage + 1} of {pageCount}
      </span>
      <button onClick={() => next()}>Next ›</button>
      <span style={{ width: 12 }} />
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && jump()}
        placeholder="Go to page…"
        style={{ width: 100 }}
      />
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p>Loading…</p>}>
        <PageToolbar />
        <div style={{ height: 420 }}>
          <Stage style={{ height: '100%', background: '#f1f5f9', borderRadius: 8 }}>
            {() => <RenderLayer />}
          </Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}

import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useLayout, usePages } from '@embedpdf/react/stage';
import type { FlowMode, LayoutKind, SpreadMode } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function LayoutControls() {
  const { flow, layout, spread, setFlow, setLayout, setSpread } = useLayout();
  const { next, prev } = usePages();
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }}>
      <label>
        Flow{' '}
        <select value={flow} onChange={(e) => setFlow(e.target.value as FlowMode)}>
          <option value="continuous">continuous</option>
          <option value="paged">paged</option>
        </select>
      </label>
      <label>
        Layout{' '}
        <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutKind)}>
          <option value="vertical">vertical</option>
          <option value="horizontal">horizontal</option>
          <option value="grid">grid</option>
        </select>
      </label>
      <label>
        Spread{' '}
        <select value={spread} onChange={(e) => setSpread(e.target.value as SpreadMode)}>
          <option value="none">none</option>
          <option value="odd">odd</option>
          <option value="even">even</option>
        </select>
      </label>
      <span style={{ flex: 1 }} />
      <button onClick={() => prev()}>‹</button>
      <button onClick={() => next()}>›</button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p>Loading…</p>}>
        <LayoutControls />
        <div style={{ height: 420 }}>
          <Stage style={{ height: '100%', background: '#f1f5f9', borderRadius: 8 }}>
            {() => <RenderLayer />}
          </Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}

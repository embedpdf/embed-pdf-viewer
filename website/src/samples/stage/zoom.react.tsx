import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useZoom } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function ZoomToolbar() {
  const { zoom, mode, zoomIn, zoomOut, fitPage, fitWidth, automatic } = useZoom();
  const fit = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{ fontWeight: active ? 'bold' : 'normal' }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
      <button onClick={zoomOut}>−</button>
      <span style={{ minWidth: 48, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
      <button onClick={zoomIn}>+</button>
      <span style={{ width: 12 }} />
      {fit('Automatic', mode === 'automatic', automatic)}
      {fit('Fit page', mode === 'fit-page', fitPage)}
      {fit('Fit width', mode === 'fit-width', fitWidth)}
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p>Loading…</p>}>
        <ZoomToolbar />
        <div style={{ height: 420 }}>
          <Stage style={{ height: '100%', background: '#f1f5f9', borderRadius: 8 }}>
            {() => <RenderLayer />}
          </Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}

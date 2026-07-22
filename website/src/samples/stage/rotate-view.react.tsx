import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function RotateButtons() {
  const stage = useStage();
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
      <button onClick={() => stage.rotateView(-90)}>⟲ Rotate left</button>
      <button onClick={() => stage.rotateView(90)}>⟳ Rotate right</button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p>Loading…</p>}>
        <RotateButtons />
        <div style={{ height: 420 }}>
          <Stage style={{ height: '100%', background: '#f1f5f9', borderRadius: 8 }}>
            {() => <RenderLayer />}
          </Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}

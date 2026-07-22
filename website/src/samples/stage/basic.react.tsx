import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <div style={{ height: 460 }}>
        <DocumentGate fallback={<p>Loading…</p>}>
          <Stage style={{ height: '100%', background: '#f1f5f9', borderRadius: 8 }}>
            {() => <RenderLayer />}
          </Stage>
        </DocumentGate>
      </div>
    </Viewer>
  );
}

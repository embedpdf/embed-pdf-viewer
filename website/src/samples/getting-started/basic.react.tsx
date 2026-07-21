import { deferredEngine, DocumentGate, Viewer } from '@embedpdf/react/runtime';
import type { Engine, OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';

// The engine boots in a worker, in the background — the UI renders at t≈0
// and only opening a document awaits it.
async function boot(): Promise<Engine> {
  const { createLocalEngineWithWorker } = await import('@embedpdf/engine');
  const { default: EngineWorker } = await import('@embedpdf/engine/worker-entry?worker');
  return createLocalEngineWithWorker({ worker: new EngineWorker() });
}

const engine = deferredEngine(() => boot());
const plugins = [stagePlugin(), renderPlugin()];

// The local engine opens bytes: fetch lazily, under the loading tab.
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <div style={{ height: 500 }}>
        {/* Document UI is defined over a document — gate it on having one. */}
        <DocumentGate fallback={<p>Loading…</p>}>
          <Stage style={{ height: '100%' }}>{() => <RenderLayer />}</Stage>
        </DocumentGate>
      </div>
    </Viewer>
  );
}

import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

// `localEngine()` is a RECIPE — a description of the engine, not a live one.
// Hand it to <Viewer> and the viewer boots PDFium (in a worker) on mount and
// destroys it on unmount: no worker wiring, no lifecycle to manage. The boot
// runs in the background, so the UI renders at t≈0 and only opening a document
// awaits it.
const engine = localEngine();
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

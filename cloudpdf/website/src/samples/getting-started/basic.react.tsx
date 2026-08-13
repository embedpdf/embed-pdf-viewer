import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

// `localEngine()` IS the engine — created synchronously, costing nothing until
// first use (no worker, no WASM). Safe at module scope, even under SSR. The
// viewer warms it up on mount, PDFium boots in the background in a worker, and
// only opening a document awaits it — the UI renders at t≈0.
const engine = cloudEngine({ baseUrl: 'https://demo.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

// The local engine opens bytes: fetch lazily, under the loading tab.
const ebook: OpenInput = { kind: 'share', shareToken: 'shr_demo_ebook' };

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

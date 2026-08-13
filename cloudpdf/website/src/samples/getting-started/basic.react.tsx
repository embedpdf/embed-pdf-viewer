import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

// The engine is created synchronously and costs nothing until first use, so
// a module-scope `const engine = …` is safe — even under SSR. Only opening a
// document does real work: the UI renders at t≈0.
const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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

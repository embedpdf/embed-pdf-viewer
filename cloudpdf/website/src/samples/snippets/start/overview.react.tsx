import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

export function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: { kind: 'url', url: '/contract.pdf' } }]}
    >
      <DocumentGate fallback={<p>Opening…</p>}>
        <Stage style={{ height: 600 }}>{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}

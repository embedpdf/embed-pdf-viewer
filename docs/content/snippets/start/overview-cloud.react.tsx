import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';
import { fetchDocumentToken } from './api';

const engine = cloudEngine({ baseUrl: 'https://pdf.example.com' });
const plugins = [stagePlugin(), renderPlugin()];

export function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: { kind: 'token', token: () => fetchDocumentToken('contract') } }]}
    >
      <DocumentGate fallback={<p>Opening…</p>}>
        <Stage style={{ height: 600 }}>{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}

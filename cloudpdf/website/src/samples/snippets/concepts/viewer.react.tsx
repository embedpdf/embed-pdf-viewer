import { DocumentGate, Viewer } from '@embedpdf/react/runtime';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { engine, plugins, source } from './pdf';
import { Toolbar } from './toolbar';

export function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source }]}>
      <Toolbar />
      <DocumentGate fallback={<p>Opening…</p>}>
        <Stage>{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}

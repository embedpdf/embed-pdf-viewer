import { DocumentGate, Viewer } from '@embedpdf/react/runtime';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { fetchDocumentToken } from './api';
import { engine, plugins } from './pdf';
import { Spinner } from './Spinner';

export function ContractViewer() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: { kind: 'token', token: () => fetchDocumentToken('contract') } }]}
    >
      <DocumentGate fallback={<Spinner />}>
        <Stage>{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}

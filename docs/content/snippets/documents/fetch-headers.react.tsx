import { DocumentGate, Viewer } from '@embedpdf/react/runtime';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { getToken } from './auth';
import { engine, plugins } from './pdf';

export function ContractViewer() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: { kind: 'url', url: '/api/files/contract.pdf' } }]}
      fetch={(url, init) =>
        fetch(url, { ...init, headers: { Authorization: `Bearer ${getToken()}` } })
      }
    >
      <DocumentGate>
        <Stage>{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}

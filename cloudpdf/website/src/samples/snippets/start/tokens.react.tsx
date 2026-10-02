import { Viewer } from '@embedpdf/react/runtime';
import { fetchDocumentToken } from './api';
import { engine, plugins } from './pdf';

export function DocumentViewer({ documentId }: { documentId: string }) {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: { kind: 'token', token: () => fetchDocumentToken(documentId) } }]}
    />
  );
}

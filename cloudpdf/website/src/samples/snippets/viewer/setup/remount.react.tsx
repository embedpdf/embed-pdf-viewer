import { PDFViewer } from '@embedpdf/viewer-react';

export function Report({ readOnly }: { readOnly: boolean }) {
  // A new key mounts a new viewer with the new config.
  return (
    <PDFViewer
      key={readOnly ? 'read-only' : 'edit'}
      src="/report.pdf"
      disable={readOnly ? ['annotations', 'forms'] : []}
      style={{ height: '100vh' }}
    />
  );
}

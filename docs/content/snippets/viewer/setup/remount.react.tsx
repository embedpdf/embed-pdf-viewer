import { PDFViewer, type Layout } from '@embedpdf/viewer-react';

const simpleLayout = (layout: Layout) => layout.remove(['tool:pan', 'menu:view'], { from: 'main' });

export function Report({ simple }: { simple: boolean }) {
  // A new key mounts a new viewer with the new config.
  return (
    <PDFViewer
      key={simple ? 'simple' : 'full'}
      src="/report.pdf"
      layout={simple ? simpleLayout : undefined}
      style={{ height: '100vh' }}
    />
  );
}

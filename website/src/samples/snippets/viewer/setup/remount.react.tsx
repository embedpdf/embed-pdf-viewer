import { PDFViewer, type Layout } from '@embedpdf/viewer-react';

const toolbarAtBottom = (layout: Layout) => layout.place('main', 'bottom');

export function Report({ toolbarBelow }: { toolbarBelow: boolean }) {
  // A new key mounts a new viewer with the new config.
  return (
    <PDFViewer
      key={toolbarBelow ? 'below' : 'above'}
      src="/report.pdf"
      layout={toolbarBelow ? toolbarAtBottom : undefined}
      style={{ height: '100vh' }}
    />
  );
}

import { PDFViewer, type Viewer } from '@embedpdf/viewer-react';

function onReady(viewer: Viewer) {
  viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
}

export function App() {
  return <PDFViewer src="/report.pdf" onReady={onReady} style={{ height: '100vh' }} />;
}

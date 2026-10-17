import { PDFViewer, type Viewer } from '@cloudpdf/viewer-react';

function onReady(viewer: Viewer) {
  viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
}

export function App() {
  return <PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} onReady={onReady} style={{ height: '100vh' }} />;
}

import { PDFViewer } from '@cloudpdf/viewer-react';

export function App() {
  return <PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} style={{ height: '100vh' }} />;
}

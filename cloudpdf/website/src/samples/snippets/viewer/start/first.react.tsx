import { PDFViewer } from '@embedpdf/viewer-react';

export function App() {
  return <PDFViewer src="/report.pdf" style={{ height: '100vh' }} />;
}

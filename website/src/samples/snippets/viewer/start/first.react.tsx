import { PDFViewer } from '@embedpdf/viewer-react';

export function App() {
  return <PDFViewer src="https://www.embedpdf.com/pdfs/welcome.pdf" style={{ height: '100vh' }} />;
}

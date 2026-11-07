import { PDFViewer } from '@embedpdf/viewer-react';
import { config } from './viewer-config';

export function App() {
  return (
    <PDFViewer
      src="https://www.embedpdf.com/pdfs/welcome.pdf"
      {...config}
      style={{ height: '100vh' }}
    />
  );
}

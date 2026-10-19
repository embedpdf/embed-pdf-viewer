import { PDFViewer } from '@embedpdf/viewer-react';
import { config } from './viewer-config';

export function App() {
  return <PDFViewer src="/report.pdf" {...config} style={{ height: '100vh' }} />;
}

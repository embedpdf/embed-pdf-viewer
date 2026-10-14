import { PDFViewer } from '@cloudpdf/viewer-react';
import { config } from './viewer-config';

export function App() {
  return <PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} {...config} style={{ height: '100vh' }} />;
}

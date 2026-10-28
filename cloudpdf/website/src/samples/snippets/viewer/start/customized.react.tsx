import { PDFViewer } from '@cloudpdf/viewer-react';
import { config } from './viewer-config';

export function App() {
  return <PDFViewer src={{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} {...config} style={{ height: '100vh' }} />;
}

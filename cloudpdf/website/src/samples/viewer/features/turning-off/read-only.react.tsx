import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-react';

const report = { grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

const config: ViewerConfig = {
  readOnly: true,
  disable: ['documents.download', 'documents.print'],
};

export default function App() {
  return <PDFViewer src={report} {...config} style={{ height: '100%' }} />;
}

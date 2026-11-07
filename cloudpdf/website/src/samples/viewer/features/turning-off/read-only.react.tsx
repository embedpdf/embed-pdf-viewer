import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-react';

const report = { grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

const config: ViewerConfig = {
  readOnly: true,
  features: { 'documents.download': false, 'documents.print': false },
};

export default function App() {
  return <PDFViewer src={report} {...config} style={{ height: '100%' }} />;
}

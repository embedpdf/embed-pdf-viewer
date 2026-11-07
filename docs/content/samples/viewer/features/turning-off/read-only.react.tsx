import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

// [!doc-source report]
const report = '/pdfs/report.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  readOnly: true,
  disable: ['documents.download', 'documents.print'],
};

export default function App() {
  return <PDFViewer src={report} {...config} style={{ height: '100%' }} />;
}

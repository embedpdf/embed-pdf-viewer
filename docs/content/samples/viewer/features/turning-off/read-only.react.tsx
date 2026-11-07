import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

// [!doc-source report]
const report = 'https://www.embedpdf.com/pdfs/report.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  readOnly: true,
  features: { 'documents.download': false, 'documents.print': false },
};

export default function App() {
  return <PDFViewer src={report} {...config} style={{ height: '100%' }} />;
}

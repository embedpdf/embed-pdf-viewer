import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

const welcome = '/pdfs/welcome.pdf';
const article = '/pdfs/article.pdf';
const report = '/pdfs/report.pdf';

const config: ViewerConfig = {
  documents: [
    { src: welcome, name: 'Welcome' },
    { src: article, name: 'Engineering blog' },
    { src: report, name: 'Q3 report', active: true },
  ],
};

export default function App() {
  return <PDFViewer {...config} style={{ height: '100%' }} />;
}

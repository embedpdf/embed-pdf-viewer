import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

const welcome = 'https://www.embedpdf.com/pdfs/welcome.pdf';
const article = 'https://www.embedpdf.com/pdfs/article.pdf';
const report = 'https://www.embedpdf.com/pdfs/report.pdf';

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

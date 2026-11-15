import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

const registration = 'https://www.embedpdf.com/pdfs/registration.pdf';

const config: ViewerConfig = {
  plugins: {
    stamp: {
      libraries: [{ id: 'marks', url: 'https://www.embedpdf.com/pdfs/marks.pdf' }],
      quick: ['marks:Check', 'marks:Cross'],
    },
  },
};

export default function App() {
  return <PDFViewer src={registration} {...config} style={{ height: '100%' }} />;
}

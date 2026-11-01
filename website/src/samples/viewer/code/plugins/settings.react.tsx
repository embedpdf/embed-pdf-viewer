import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

const links = '/pdfs/links.pdf';

const config: ViewerConfig = {
  plugins: {
    stage: { spread: 'odd', zoom: { mode: 'fit-width' } },
    selection: { color: 'rgb(124 58 237 / 0.3)' },
  },
};

export default function App() {
  return <PDFViewer src={links} {...config} style={{ height: '100%' }} />;
}

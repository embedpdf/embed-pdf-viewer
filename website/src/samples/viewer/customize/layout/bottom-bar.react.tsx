import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

const welcome = '/pdfs/welcome.pdf';

const config: ViewerConfig = {
  layout: (layout) =>
    layout
      .place('main', 'bottom')
      .remove('zoom', { from: 'main' })
      .addBar('zoom', {
        place: { float: 'bottom-end' },
        center: [[{ custom: 'zoom' }]],
      }),
};

export default function App() {
  return <PDFViewer src={welcome} {...config} style={{ height: '100%' }} />;
}

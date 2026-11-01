import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

const welcome = '/pdfs/welcome.pdf';

const config: ViewerConfig = {
  commands: [
    { id: 'acme:chapters', label: 'Chapters', icon: 'book', menu: 'chapters' },
    { id: 'acme:origins', label: 'Origins', run: ({ get }) => get('stage').goToPage(1) },
    { id: 'acme:timeline', label: 'Timeline', run: ({ get }) => get('stage').goToPage(2) },
    { id: 'acme:workflows', label: 'Workflows', run: ({ get }) => get('stage').goToPage(3) },
    { id: 'acme:cover', label: 'Back to the cover', run: ({ get }) => get('stage').goToPage(0) },
  ],
  layout: (layout) =>
    layout
      .addMenu('chapters', [['acme:origins', 'acme:timeline', 'acme:workflows'], ['acme:cover']])
      .add('acme:chapters', { to: 'main', section: 'end' }),
};

export default function App() {
  return <PDFViewer src={welcome} {...config} style={{ height: '100%' }} />;
}

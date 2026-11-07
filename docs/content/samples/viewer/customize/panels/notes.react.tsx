import { PDFViewer, Panel, type ViewerConfig } from '@embedpdf/viewer-react';
import './notes.css';

// [!doc-source welcome]
const welcome = 'https://www.embedpdf.com/pdfs/welcome.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  layout: (layout) =>
    layout
      .addPanel('notes', {
        side: 'end',
        title: 'Notes',
        icon: 'book',
        width: { initial: 320, min: 240, max: 480 },
      })
      .add('panel:notes', { to: 'main', section: 'end' }),
};

export default function App() {
  return (
    <PDFViewer src={welcome} {...config} style={{ height: '100%' }}>
      <Panel id="notes">
        <textarea className="notes" placeholder="Your notes" />
      </Panel>
    </PDFViewer>
  );
}

import { PDFViewer, Panel, type Layout } from '@embedpdf/viewer-react';
import { Notes } from './notes'; // your app

const layout = (layout: Layout) =>
  layout
    .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
    .add('panel:notes', { to: 'main', section: 'end' });

export function Review() {
  return (
    <PDFViewer src="/report.pdf" layout={layout} style={{ height: '100vh' }}>
      <Panel id="notes">
        <Notes />
      </Panel>
    </PDFViewer>
  );
}

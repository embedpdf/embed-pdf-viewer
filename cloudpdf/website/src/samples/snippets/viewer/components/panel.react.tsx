import { PDFViewer, Panel, type Layout } from '@cloudpdf/viewer-react';
import { Notes } from './notes'; // your app

const layout = (layout: Layout) =>
  layout
    .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
    .add('panel:notes', { to: 'main', section: 'end' });

export function Review() {
  return (
    <PDFViewer src={{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} layout={layout} style={{ height: '100vh' }}>
      <Panel id="notes">
        <Notes />
      </Panel>
    </PDFViewer>
  );
}

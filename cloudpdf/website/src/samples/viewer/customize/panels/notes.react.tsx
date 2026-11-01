import { PDFViewer, Panel, type ViewerConfig } from '@cloudpdf/viewer-react';
import './notes.css';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

const config: ViewerConfig = {
  layout: (layout) =>
    layout
      .addPanel('notes', {
        side: 'end',
        title: 'Notes',
        icon: 'book',
        present: { medium: 'dock' },
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

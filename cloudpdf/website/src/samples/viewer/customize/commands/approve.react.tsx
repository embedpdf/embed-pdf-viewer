import { useMemo, useState } from 'react';
import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-react';
import './approve.css';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

export default function App() {
  const [status, setStatus] = useState('Waiting for approval');
  // Made once: the viewer reads its commands when it starts.
  const config = useMemo<ViewerConfig>(
    () => ({
      commands: [
        {
          id: 'acme:approve',
          label: 'Approve',
          icon: 'check',
          shortcut: 'Mod+Enter',
          run: () => setStatus(`Approved at ${new Date().toLocaleTimeString()}`),
        },
      ],
      layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
    }),
    [],
  );

  return (
    <div className="app" style={{ height: '100%' }}>
      <p className="status">
        Status: <strong>{status}</strong>
      </p>
      <PDFViewer src={welcome} {...config} className="viewer" />
    </div>
  );
}

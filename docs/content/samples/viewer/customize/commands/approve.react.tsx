import { useState } from 'react';
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';
import './approve.css';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

// A constant: the command calls your app through `appState`, so it never holds an old value.
const config: ViewerConfig<{ approve(): void }> = {
  commands: [
    {
      id: 'acme:approve',
      label: 'Approve',
      icon: 'check',
      shortcut: 'Mod+Enter',
      run: ({ appState }) => appState.approve(),
    },
  ],
  layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
};

export default function App() {
  const [status, setStatus] = useState('Waiting for approval');
  const approve = () => setStatus(`Approved at ${new Date().toLocaleTimeString()}`);

  return (
    <div className="app" style={{ height: '100%' }}>
      <p className="status">
        Status: <strong>{status}</strong>
      </p>
      <PDFViewer src={welcome} {...config} appState={{ approve }} className="viewer" />
    </div>
  );
}

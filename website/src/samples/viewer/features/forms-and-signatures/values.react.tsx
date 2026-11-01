import { useState } from 'react';
import { PDFViewer, type Viewer } from '@embedpdf/viewer-react';

import './values.css';

const forms = '/pdfs/forms.pdf';

export default function App() {
  const [values, setValues] = useState('{}');

  // Once the form is open: show its values as they change, and fill in what the app knows.
  function onReady(viewer: Viewer) {
    viewer.documents.onOpened(async () => {
      const form = viewer.get('form');
      form.onValueChanged(() => setValues(JSON.stringify(form.exportValues())));
      await form.importValues({ name: 'Ada Lovelace', email: 'ada@example.com' });
    });
  }

  return (
    <div className="app">
      <PDFViewer src={forms} onReady={onReady} className="viewer" />
      <footer className="values">
        <span className="label">exportValues()</span>
        <code className="code">{values}</code>
      </footer>
    </div>
  );
}

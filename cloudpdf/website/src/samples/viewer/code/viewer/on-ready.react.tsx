import { useState } from 'react';
import { PDFViewer, type Viewer } from '@cloudpdf/viewer-react';

import './on-ready.css';

const article = { grant: 'shr_v09cJHOmj3C8vrfUlZNTDyqX' };

export default function App() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [page, setPage] = useState<number | null>(null);

  function onReady(viewer: Viewer) {
    setViewer(viewer);
    // The pages are the document's: follow the current one once it has opened.
    viewer.documents.onOpened(() => {
      const stage = viewer.get('stage');
      setPage(stage.getCurrentPageIndex() + 1);
      viewer.watch(
        () => stage.getCurrentPageIndex(),
        (index) => setPage(index + 1),
      );
    });
  }

  return (
    <div className="app">
      <header className="bar">
        <span className="page">{page ? `Page ${page}` : 'Opening…'}</span>
        <button
          type="button"
          className="button"
          disabled={!viewer}
          onClick={() => viewer?.commands.execute('document:print')}
        >
          Print
        </button>
      </header>
      <PDFViewer src={article} onReady={onReady} className="viewer" />
    </div>
  );
}

import { useState } from 'react';
import { PDFViewer, ToolbarItem, usePDFViewer, type Viewer } from '@embedpdf/viewer-react';

// Inside the viewer: any component you give it.
function FirstPage() {
  const viewer = usePDFViewer();
  return <button onClick={() => viewer.get('stage').goToPage(0)}>First page</button>;
}

// Outside the viewer: keep it from onReady.
export function Review() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  return (
    <>
      <button disabled={!viewer} onClick={() => viewer?.commands.execute('document:print')}>
        Print
      </button>
      <PDFViewer src="/report.pdf" onReady={setViewer} style={{ height: '80vh' }}>
        <ToolbarItem id="first-page">
          <FirstPage />
        </ToolbarItem>
      </PDFViewer>
    </>
  );
}

import { PDFViewer, ToolbarItem } from '@embedpdf/viewer-react';
import { useDocumentStatus } from './my-app';

const layout = (layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });

function DocumentStatus() {
  const status = useDocumentStatus(); // your own app state
  return <span className="status">{status}</span>;
}

export function App() {
  return (
    <PDFViewer src="/report.pdf" layout={layout} style={{ height: '100vh' }}>
      <ToolbarItem id="status">
        <DocumentStatus />
      </ToolbarItem>
    </PDFViewer>
  );
}

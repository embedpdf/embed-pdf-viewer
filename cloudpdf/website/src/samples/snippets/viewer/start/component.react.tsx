import { PDFViewer, ToolbarItem, type Layout } from '@cloudpdf/viewer-react';
import { useDocumentStatus } from './my-app';

const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });

function DocumentStatus() {
  const status = useDocumentStatus(); // your own app state
  return <span className="status">{status}</span>;
}

export function App() {
  return (
    <PDFViewer src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} layout={layout} style={{ height: '100vh' }}>
      <ToolbarItem id="status">
        <DocumentStatus />
      </ToolbarItem>
    </PDFViewer>
  );
}

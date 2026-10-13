import { PDFViewer, Region } from '@embedpdf/viewer-react';
import { AppHeader, RecentFiles } from './app'; // your app

export function Workspace() {
  return (
    <PDFViewer style={{ height: '100vh' }}>
      <Region name="header">
        <AppHeader />
      </Region>
      <Region name="empty">
        <RecentFiles />
      </Region>
    </PDFViewer>
  );
}

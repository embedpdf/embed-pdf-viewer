import { PDFViewer } from '@embedpdf/viewer-react';

export function Report() {
  return (
    <PDFViewer
      src="/report.pdf"
      theme="system"
      disable={['forms']}
      onReady={(viewer) => console.log('ready', viewer)}
      style={{ height: '100vh' }}
    />
  );
}

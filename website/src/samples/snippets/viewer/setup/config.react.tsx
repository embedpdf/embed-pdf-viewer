import { PDFViewer } from '@embedpdf/viewer-react';

export function Report() {
  return (
    <PDFViewer
      src="https://www.embedpdf.com/pdfs/welcome.pdf"
      theme="system"
      features={{ forms: false }}
      onReady={(viewer) => console.log('ready', viewer)}
      style={{ height: '100vh' }}
    />
  );
}

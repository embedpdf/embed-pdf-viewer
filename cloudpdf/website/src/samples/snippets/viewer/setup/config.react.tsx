import { PDFViewer } from '@cloudpdf/viewer-react';

export function Report() {
  return (
    <PDFViewer
      src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }}
      theme="system"
      disable={['forms']}
      onReady={(viewer) => console.log('ready', viewer)}
      style={{ height: '100vh' }}
    />
  );
}

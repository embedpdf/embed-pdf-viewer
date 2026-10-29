import { PDFViewer } from '@cloudpdf/viewer-react';

export function Report() {
  return (
    <PDFViewer
      src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }}
      theme="system"
      disable={['forms']}
      onReady={(viewer) => console.log('ready', viewer)}
      style={{ height: '100vh' }}
    />
  );
}

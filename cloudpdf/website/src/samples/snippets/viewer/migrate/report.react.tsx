// 2.x:
//
// import { PDFViewer } from '@embedpdf/react-pdf-viewer';
//
// export function Report() {
//   return (
//     <PDFViewer
//       config={{
//         src: { shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' },
//         theme: { preference: 'dark' },
//         disabledCategories: ['redaction', 'document-print'],
//       }}
//       onReady={(registry) => console.log('ready', registry)}
//       style={{ height: '100vh' }}
//     />
//   );
// }

import { PDFViewer } from '@cloudpdf/viewer-react';

export function Report() {
  return (
    <PDFViewer
      src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }}
      theme="dark"
      disable={['redaction', 'documents.print']}
      onReady={(viewer) => console.log('ready', viewer)}
      style={{ height: '100vh' }}
    />
  );
}

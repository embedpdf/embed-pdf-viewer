// 2.x:
//
// import { PDFViewer } from '@embedpdf/react-pdf-viewer';
//
// export function Report() {
//   return (
//     <PDFViewer
//       config={{
//         src: '/report.pdf',
//         theme: { preference: 'dark' },
//         disabledCategories: ['redaction', 'document-print'],
//       }}
//       onReady={(registry) => console.log('ready', registry)}
//       style={{ height: '100vh' }}
//     />
//   );
// }

import { PDFViewer } from '@embedpdf/viewer-react';

export function Report() {
  return (
    <PDFViewer
      src="/report.pdf"
      theme="dark"
      disable={['redaction', 'documents.print']}
      onReady={(viewer) => console.log('ready', viewer)}
      style={{ height: '100vh' }}
    />
  );
}

// 2.x:
//
// import { PDFViewer } from '@embedpdf/react-pdf-viewer';
//
// export function Report() {
//   return (
//     <PDFViewer
//       config={{
//         src: 'https://www.embedpdf.com/pdfs/welcome.pdf',
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
      src="https://www.embedpdf.com/pdfs/welcome.pdf"
      theme="dark"
      features={{ 'documents.print': false }}
      onReady={(viewer) => console.log('ready', viewer)}
      style={{ height: '100vh' }}
    />
  );
}

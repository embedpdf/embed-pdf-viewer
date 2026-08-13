import { PDFViewer } from '@embedpdf/react-pdf-viewer';

export default function App() {
  return (
    <PDFViewer
      config={{ src: 'https://snippet.embedpdf.com/ebook.pdf' }}
      style={{ height: '500px' }}
      onReady={(registry) => {
        console.log('PDF viewer ready!', registry);
      }}
    />
  );
}

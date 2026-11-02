import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-react';

// [!doc-source article]
const article = '/pdfs/article.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  plugins: {
    annotation: {
      tools: [
        { id: 'highlight', defaults: { color: '#fde047', opacity: 0.4 } },
        { id: 'ink', defaults: { color: '#1d4ed8', strokeWidth: 2 } },
      ],
    },
  },
};

export default function App() {
  return <PDFViewer src={article} {...config} style={{ height: '100%' }} />;
}

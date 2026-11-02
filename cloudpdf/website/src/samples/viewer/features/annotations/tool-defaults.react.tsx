import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-react';

const article = { grant: 'shr_v09cJHOmj3C8vrfUlZNTDyqX' };

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

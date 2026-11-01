import { PDFViewer, type Layout, type LayoutEnv } from '@embedpdf/viewer-react';

import './phone.css';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

const layout = (layout: Layout, env: LayoutEnv) =>
  env.size === 'compact' ? layout.place('main', 'bottom') : layout;

export default function App() {
  return (
    <div className="phone">
      <PDFViewer src={welcome} layout={layout} style={{ height: '100%' }} />
    </div>
  );
}

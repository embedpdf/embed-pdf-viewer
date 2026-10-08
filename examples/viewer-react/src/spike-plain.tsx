/**
 * The same viewer without any headless hook: what an app that never imports
 * `@embedpdf/react` ships, to compare bundle sizes across viewer builds.
 */
import { PDFViewer } from '@embedpdf/viewer-react';
import { createRoot } from 'react-dom/client';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <PDFViewer src="/testlab.pdf" style={{ height: '100vh', display: 'block' }} />,
);

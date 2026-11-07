'use client';

import { PDFViewer } from '@embedpdf/viewer-react';

export function ReadyMadeViewer() {
  return (
    <PDFViewer
      src="/embedpdf-documents-belong-on-the-web.pdf"
      theme={{ preference: 'light', accent: '#0876FD' }}
      style={{ height: '100%' }}
    />
  );
}

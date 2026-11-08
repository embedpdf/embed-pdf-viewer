'use client';

import { PDFViewer } from '@embedpdf/viewer-react';

/** The features that start off, on: the demo shows everything the viewer can do. */
const EVERY_FEATURE = {
  measurement: true,
  redaction: true,
  'forms.building': true,
  snapshots: true,
} as const;

export function ReadyMadeViewer() {
  return (
    <PDFViewer
      src="/embedpdf-documents-belong-on-the-web.pdf"
      theme={{ preference: 'light', accent: '#0876FD' }}
      features={EVERY_FEATURE}
      style={{ height: '100%' }}
    />
  );
}

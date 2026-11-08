'use client';

import { PDFViewer } from '@embedpdf/viewer-react';

/** The features that start off, on: the demo shows everything the viewer can do. */
const EVERY_FEATURE = {
  measurement: true,
  redaction: true,
  'forms.building': true,
  snapshots: true,
} as const;

// What a consumer writes, with every feature on to show them all: the engine's
// default wasm source is a bundler-resolved sibling asset, so webpack ships
// embedpdf.wasm inside this site's own build (.next/static/media) — no CDN, no
// overrides.
export function LivePdfViewer() {
  return (
    <PDFViewer
      src="/embedpdf-documents-belong-on-the-web.pdf"
      theme="light"
      features={EVERY_FEATURE}
      style={{ display: 'block', height: '100%', width: '100%' }}
    />
  );
}

'use client';

import { PDFViewer } from '@embedpdf/viewer-react';

// Zero config, exactly what a consumer writes: the engine's default wasm
// source is a bundler-resolved sibling asset, so webpack ships embedpdf.wasm
// inside this site's own build (.next/static/media) — no CDN, no overrides.
export function LivePdfViewer() {
  return (
    <PDFViewer
      src="/demo/sample.pdf"
      theme="light"
      style={{ display: 'block', height: '100%', width: '100%' }}
    />
  );
}

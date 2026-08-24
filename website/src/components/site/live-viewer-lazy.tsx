'use client';

import dynamic from 'next/dynamic';

/**
 * The live viewer, client-only (it boots a wasm engine) with the shared
 * loading state. Two consumers, two framings: the homepage showcase puts it
 * inside a browser mock (a product SHOT), /demo runs it full-bleed (the
 * product ITSELF).
 */
export const LiveViewerLazy = dynamic(
  () => import('./live-pdf-viewer').then((module) => module.LivePdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#F3F6FB]">
        <div className="flex items-center gap-3 font-sans text-sm font-medium text-[#5A6B92]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#C7DEFF] border-t-[#0876FD]" />
          Loading the viewer…
        </div>
      </div>
    ),
  },
);

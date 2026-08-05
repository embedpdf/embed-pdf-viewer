import type { Metadata } from 'next';

import { LiveViewerLazy } from '@/components/site/live-viewer-lazy';

export const metadata: Metadata = {
  title: 'Live PDF Viewer Demo — EmbedPDF',
  description:
    'Explore the complete open source EmbedPDF viewer with search, navigation, annotations, forms, and more.',
};

/**
 * The demo IS the page. No hero, no browser mock — the viewer takes the whole
 * viewport under the sticky site header, because the thing being demoed is an
 * app, and a PDF read through a 620px letterbox doesn't feel like one. The
 * marketing framing lives on the homepage showcase; here you just use it.
 *
 * 100svh (not vh) so the mobile URL bar can't push the toolbar off-screen,
 * minus 85px: the header's 84px row plus its 1px bottom border. Exact, so the
 * viewer ends precisely at the fold and the footer stays below it.
 */
export default function DemoPage() {
  return (
    <main className="bg-ep-bg">
      {/* The page still needs its one H1 for search — the viewer's own chrome
          supplies the visible framing. */}
      <h1 className="sr-only">Live EmbedPDF viewer demo</h1>
      <div className="h-[calc(100svh-85px)] w-full">
        <LiveViewerLazy />
      </div>
    </main>
  );
}

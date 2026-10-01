import { useEffect } from 'react';
import { Viewer, DocumentGate, createCapabilityToken } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import type { StageCapability } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './thumbnail-strip.css';

const engine = localEngine();

// The strip is a second view of the document, with its own token and settings.
const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');

const plugins = [
  stagePlugin(), // the main view
  stagePlugin({
    id: 'stage-thumbs',
    token: ThumbsToken,
    interaction: false, // a drag doesn't select text or draw
    zoomGestures: false, // a pinch doesn't resize the thumbnails
    zoom: { pageWidth: 96 },
    gap: { px: 12 },
    padding: 10,
    pageFrame: { bottom: 20 }, // room for the page number
    // A wide, short strip (on a phone) lines the thumbnails up in a row.
    responsive: [{ when: { orientation: 'landscape' }, settings: { layout: 'horizontal' } }],
  }),
  renderPlugin(),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function Thumbnails() {
  const main = useStage();
  const thumbs = useStage(ThumbsToken);
  const { currentPageIndex } = useStageState();

  // Keep the current page's thumbnail in view as the reader moves.
  useEffect(() => {
    thumbs.reveal(currentPageIndex);
  }, [thumbs, currentPageIndex]);

  return (
    <Stage
      token={ThumbsToken}
      className="strip"
      pageChrome={(page) => (
        <span className="number" style={{ height: page.frame.bottom }}>
          {page.pageIndex + 1}
        </span>
      )}
    >
      {(page) => (
        <button
          type="button"
          className="thumb"
          aria-label={`Page ${page.pageIndex + 1}`}
          aria-current={page.pageIndex === currentPageIndex}
          onClick={() => main.goToPage(page.ref)}
        >
          <RenderLayer />
        </button>
      )}
    </Stage>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="reader">
          <Thumbnails />
          <Stage className="stage">{() => <RenderLayer />}</Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}

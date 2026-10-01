import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, useDocumentId } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePageList, usePages } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { stampPlugin, useStamp, useStampAssets } from '@embedpdf/react/stamp';
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import { localEngine } from '@embedpdf/engine';

import './programmatic.css';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // stamp libraries are PDFs; they open here too
// [!/asset-engine]
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function PlaceByCode() {
  const stamp = useStamp();
  const assets = useStampAssets();
  const documentId = useDocumentId();
  const { currentPage } = usePages();
  const { pages } = usePageList();
  const page = pages[currentPage];
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (assets.length > 0) return;
    loadDefaultLibrary('en')
      .then((bytes) => stamp.importLibrary(bytes))
      .catch((err) => setStatus(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  // The same box a click would produce: centred on `at` (page points, origin
  // top-left), fitted and clamped to the page, /Name and /Subj written.
  const place = async (identifier: string, at: { x: number; y: number }, rotation = 0) => {
    const asset = assets.find((a) => a.name === identifier);
    if (!asset || !documentId || !page) return;
    const ref = await stamp.placeAsset(documentId, asset.id, {
      page: page.ref,
      at,
      targetWidth: 160,
      rotation,
    });
    setStatus(
      `placed ${asset.label} on page ${ref.page.objectNumber === page.ref.objectNumber ? currentPage + 1 : '?'}`,
    );
  };

  return (
    <div className="toolbar">
      <output className="readout">page {currentPage + 1}</output>
      <button
        type="button"
        className="button"
        title="Place the Approved stamp near the top-left corner of this page"
        disabled={assets.length === 0}
        onClick={() => void place('Approved', { x: 120, y: 90 })}
      >
        Approve
      </button>
      <button
        type="button"
        className="button"
        title="Place the Draft stamp, rotated"
        disabled={assets.length === 0}
        onClick={() => void place('Draft', { x: 300, y: 200 }, 15)}
      >
        Mark as draft
      </button>
      <span className="spacer" />
      <output className="readout">{status}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PlaceByCode />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

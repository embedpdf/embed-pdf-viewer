import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotationList,
  useAnnotationState,
} from '@embedpdf/react/annotation';
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

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The middle of a Letter page, in page coordinates.
const MIDDLE = { x: 306, y: 396 };

function PlaceStamps() {
  const stamp = useStamp();
  const assets = useStampAssets();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const currentPage = useStageState((state) => state.currentPageIndex);
  const stamps = useAnnotationList({ subtype: 'stamp' });
  const loaded = useRef(false);

  const approved = assets.find((asset) => asset.name === 'Approved');
  const draft = assets.find((asset) => asset.name === 'Draft');

  // On load: the standard stamps, ready to place.
  useEffect(() => {
    if (!ready || loaded.current) return;
    loaded.current = true;
    void loadDefaultLibrary('en').then((bytes) => stamp.importLibrary(bytes));
  }, [stamp, ready]);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!approved}
        onClick={() =>
          approved &&
          void stamp.placeAsset(approved.id, { page: currentPage, center: MIDDLE, select: true })
        }
      >
        Approve this page
      </button>
      <button
        type="button"
        className="button"
        disabled={!draft}
        onClick={() =>
          draft &&
          void stamp.placeAssetOnPages(draft.id, 'all', {
            center: MIDDLE,
            targetWidth: 320,
            rotation: -30,
          })
        }
      >
        “Draft” on every page
      </button>
      <span className="spacer" />
      <output className="readout">
        {stamps.length} {stamps.length === 1 ? 'stamp' : 'stamps'} in the document
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PlaceStamps />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

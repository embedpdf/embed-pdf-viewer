import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
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
const assetEngine = engine; // stamp libraries are PDFs; they open here too
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The middle of a Letter page, and the cover's empty corner, in page coordinates.
const MIDDLE = { x: 306, y: 396 };
const CORNER = { x: 60, y: 590, width: 220, height: 180 };

function PlaceStamps() {
  const stamp = useStamp();
  const stage = useStage();
  const assets = useStampAssets();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const currentPage = useStageState((state) => state.currentPageIndex);
  const stamps = useAnnotationList({ subtype: 'stamp' });
  const placed = useRef(false);

  const approved = assets.find((asset) => asset.name === 'Approved');
  const draft = assets.find((asset) => asset.name === 'Draft');

  // On load: the standard stamps, and "Approved" in the cover's empty corner, scrolled into view.
  useEffect(() => {
    if (!ready || placed.current) return;
    placed.current = true;
    void loadDefaultLibrary('en')
      .then((bytes) => stamp.importLibrary(bytes))
      .then(({ library }) => {
        const asset = stamp
          .listAssets({ libraryId: library.id })
          .find((candidate) => candidate.name === 'Approved');
        if (!asset) return;
        return stamp.placeAsset(asset.id, {
          page: 0,
          center: { x: 170, y: 680 },
          targetWidth: 180,
          rotation: -8,
        });
      })
      .then(() => stage.reveal(0, { rect: CORNER }));
  }, [stamp, stage, ready]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PlaceStamps />
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

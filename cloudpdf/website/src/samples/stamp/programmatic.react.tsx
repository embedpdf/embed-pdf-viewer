import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotationList,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { stampPlugin, useStamp, useStampAssets } from '@embedpdf/react/stamp';
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';

import './programmatic.css';

const engine = cloudEngine();
const assetEngine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

const approvals: OpenInput = { kind: 'grant', grant: 'shr_lu5Sb4r9PYjKrHS3qfNeUywM' };

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: approvals }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PlaceStamps />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './select-code.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The top half of the cover, where the box selects.
const TOP_HALF = { x: 0, y: 0, width: 612, height: 396 };

// On load: two shapes at the top of the cover, two at the bottom, and all four selected.
function AddShapes() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void Promise.all([
      annotation.create(cover, {
        subtype: 'square',
        box: { x: 60, y: 40, width: 120, height: 50 },
        color: '#e5484d',
        strokeWidth: 3,
      }),
      annotation.create(cover, {
        subtype: 'circle',
        box: { x: 490, y: 200, width: 80, height: 80 },
        color: '#1e90ff',
        strokeWidth: 3,
      }),
      annotation.create(cover, {
        subtype: 'square',
        box: { x: 96, y: 506, width: 178, height: 54 },
        color: '#30a46c',
        strokeWidth: 3,
      }),
      annotation.create(cover, {
        subtype: 'text',
        rect: { x: 480, y: 640, width: 20, height: 20 },
        contents: 'A note at the bottom',
        color: '#facc15',
      }),
    ]).then(() => annotation.selection.selectAll(cover));
  }, [annotation, ready, cover]);

  return null;
}

function SelectionToolbar() {
  const annotation = useAnnotation();
  const { selected } = useAnnotationState(); // the selected annotations
  const cover = usePageList()[0]?.ref;

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!cover}
        onClick={() => cover && annotation.selection.selectAll(cover)}
      >
        Everything on the cover
      </button>
      <button
        type="button"
        className="button"
        disabled={!cover}
        onClick={() => cover && annotation.selection.selectInRect(cover, TOP_HALF)}
      >
        The top half
      </button>
      <button
        type="button"
        className="button"
        disabled={selected.length === 0}
        onClick={() => annotation.selection.clear()}
      >
        Clear
      </button>
      <span className="spacer" />
      <output className="readout">{selected.length} selected</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddShapes />
        <SelectionToolbar />
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

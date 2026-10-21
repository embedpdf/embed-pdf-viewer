import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
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

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const review: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The top half of a page, where the box selects: on the shapes page, its first row.
const TOP_HALF = { x: 0, y: 0, width: 612, height: 396 };

// On load: the shapes page, with everything on it selected.
function SelectShapes() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const page = usePageList()[2]?.ref;
  const done = useRef(false);

  useEffect(() => {
    if (!ready || !page || done.current) return;
    done.current = true;
    annotation.selection.selectAll(page);
    stage.goToPage(page);
  }, [annotation, stage, ready, page]);

  return null;
}

function SelectionToolbar() {
  const annotation = useAnnotation();
  const { selected } = useAnnotationState(); // the selected annotations
  const page = usePageList()[2]?.ref; // the shapes page

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!page}
        onClick={() => page && annotation.selection.selectAll(page)}
      >
        Everything on the page
      </button>
      <button
        type="button"
        className="button"
        disabled={!page}
        onClick={() => page && annotation.selection.selectInRect(page, TOP_HALF)}
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectShapes />
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

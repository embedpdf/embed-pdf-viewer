import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
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
import { localEngine } from '@embedpdf/engine';

import './turn-group.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source layout]
const layout = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/layout.pdf');
  return { kind: 'bytes', id: 'layout', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// On load: the document's square and circle, both selected.
function SelectShapes() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const found = annotation.list().filter((each) => each.nm === 'square' || each.nm === 'circle');
    if (found.length === 0) return;
    annotation.selection.set(found.map((each) => each.ref));
    stage.reveal(found[0].page, { rect: found[0].rect });
  }, [annotation, stage, ready]);

  return null;
}

function TurnAndGroup() {
  const annotation = useAnnotation();
  // Read on every selection change, so the buttons follow what's selected.
  const { selected } = useAnnotationState();
  const nothing = selected.length === 0;

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={nothing}
        onClick={() => annotation.selection.rotateBy(-90)}
      >
        ↺ Turn left
      </button>
      <button
        type="button"
        className="button"
        disabled={nothing}
        onClick={() => annotation.selection.rotateBy(90)}
      >
        ↻ Turn right
      </button>
      <button
        type="button"
        className="button"
        disabled={nothing}
        onClick={() => annotation.selection.resetRotation()}
      >
        Upright
      </button>
      <span className="spacer" />
      <button
        type="button"
        className="button"
        disabled={!annotation.selection.canGroup()}
        onClick={() => annotation.selection.group()}
      >
        Group
      </button>
      <button
        type="button"
        className="button"
        disabled={!annotation.selection.canUngroup()}
        onClick={() => annotation.selection.ungroup()}
      >
        Ungroup
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: layout }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectShapes />
        <TurnAndGroup />
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

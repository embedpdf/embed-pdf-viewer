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

import './turn-group.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// On load: a rectangle and a circle on the cover, both selected.
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
        box: { x: 300, y: 560, width: 140, height: 60 },
        color: '#e5484d',
        interiorColor: '#ffe4e1',
        strokeWidth: 3,
      }),
      annotation.create(cover, {
        subtype: 'circle',
        box: { x: 460, y: 550, width: 80, height: 80 },
        color: '#1e90ff',
        strokeWidth: 3,
      }),
    ]).then((created) => annotation.selection.set(created.map((c) => c.annotation.ref)));
  }, [annotation, ready, cover]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddShapes />
        <TurnAndGroup />
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

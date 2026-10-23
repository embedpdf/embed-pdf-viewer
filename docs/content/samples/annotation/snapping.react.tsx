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
  useAnnotationSettings,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './snapping.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source layout]
const layout = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-layout.pdf');
  return { kind: 'bytes', id: 'layout', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const QUARTERS = [0, 90, 180, 270];
const EIGHTHS = [0, 45, 90, 135, 180, 225, 270, 315];

// On load: the document's circle, selected. Drag it toward the square to see it snap.
function SelectCircle() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const circle = annotation.list().find((each) => each.nm === 'circle');
    if (!circle) return;
    annotation.selection.set([circle.ref]);
    stage.reveal(circle.page, { rect: circle.rect });
  }, [annotation, stage, ready]);

  return null;
}

function SnapControls() {
  const annotation = useAnnotation();
  const snap = useAnnotationSettings((settings) => settings.snap);

  return (
    <div className="toolbar">
      <label className="check">
        <input
          type="checkbox"
          checked={snap.alignment}
          onChange={(event) =>
            annotation.updateSettings({ snap: { alignment: event.target.checked } })
          }
        />
        Snap to other annotations
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={snap.rotationAngles.length === EIGHTHS.length}
          onChange={(event) =>
            annotation.updateSettings({
              snap: { rotationAngles: event.target.checked ? EIGHTHS : QUARTERS },
            })
          }
        />
        Turns snap every 45°
      </label>
      <p className="hint">Hold Shift to move or turn freely</p>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: layout }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectCircle />
        <SnapControls />
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

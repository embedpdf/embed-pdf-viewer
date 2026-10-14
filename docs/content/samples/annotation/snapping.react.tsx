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
  useAnnotationSettings,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './snapping.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const QUARTERS = [0, 90, 180, 270];
const EIGHTHS = [0, 45, 90, 135, 180, 225, 270, 315];

// On load: two rectangles on the cover, the right one selected. Drag it next to the other.
function AddRectangles() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(cover, {
      subtype: 'square',
      box: { x: 96, y: 506, width: 178, height: 54 },
      color: '#1e90ff',
      strokeWidth: 3,
    });
    void annotation.create(
      cover,
      {
        subtype: 'square',
        box: { x: 340, y: 560, width: 120, height: 80 },
        color: '#e5484d',
        strokeWidth: 3,
      },
      undefined,
      { select: true },
    );
  }, [annotation, ready, cover]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddRectangles />
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

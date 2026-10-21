import { useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationList,
  type AnnotationRef,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './create-update.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Create a rectangle, then change, move and delete it, all from code.
function SquareControls() {
  const annotation = useAnnotation();
  const stage = useStage();
  const page = usePageList()[4]?.ref; // the document's empty last page
  const [ref, setRef] = useState<AnnotationRef | null>(null);
  useAnnotationList(); // re-render as the annotations change, for the reads below

  const add = async () => {
    if (!page) return;
    const { annotation: square } = await annotation.create(page, {
      subtype: 'square',
      box: { x: 72, y: 592, width: 200, height: 100 },
      color: '#0078ff',
      strokeWidth: 3,
    });
    setRef(square.ref);
    stage.reveal(page, { rect: square.rect });
  };

  const square = ref ? annotation.get(ref) : null;
  const canUpdate = square !== null && annotation.canUpdate(square.ref);
  const canDelete = square !== null && annotation.canDelete(square.ref);

  let status = 'No rectangle';
  if (square) status = annotation.isPending(square.ref) ? 'Saving…' : 'Saved';

  return (
    <div className="toolbar">
      <button type="button" className="button" disabled={square !== null} onClick={add}>
        Create
      </button>
      <button
        type="button"
        className="button"
        disabled={!canUpdate}
        onClick={() => square && annotation.update(square.ref, { color: '#dc143c' })}
      >
        Make it red
      </button>
      <button
        type="button"
        className="button"
        disabled={!canUpdate}
        onClick={() => {
          if (!square) return;
          const { rect } = square;
          void annotation.update(square.ref, { rect: { ...rect, x: rect.x + 40 } }); // 40 points right
        }}
      >
        Move right
      </button>
      <button
        type="button"
        className="button"
        disabled={!canUpdate}
        onClick={() => square && annotation.update(square.ref, { rotation: 90 })}
      >
        Turn to 90°
      </button>
      <button
        type="button"
        className="button"
        disabled={!canDelete}
        onClick={() => {
          if (!square) return;
          void annotation.delete(square.ref);
          setRef(null);
        }}
      >
        Delete
      </button>
      <span className="spacer" />
      <output className="readout">{status}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SquareControls />
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

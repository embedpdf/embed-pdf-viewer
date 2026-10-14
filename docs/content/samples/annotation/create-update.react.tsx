import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationList,
  useAnnotationState,
  type AnnotationRef,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './create-update.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Create a rectangle, then change, move and delete it, all from code.
function SquareControls() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const [ref, setRef] = useState<AnnotationRef | null>(null);
  const started = useRef(false);
  useAnnotationList(); // re-render as the annotations change, for the reads below

  const add = async () => {
    if (!cover) return;
    const { annotation: square } = await annotation.create(cover, {
      subtype: 'square',
      box: { x: 72, y: 592, width: 200, height: 100 },
      color: '#0078ff',
      strokeWidth: 3,
    });
    setRef(square.ref);
  };

  // On load: one rectangle, to change.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void add();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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

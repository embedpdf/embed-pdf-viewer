import { useEffect, useRef, useState } from 'react';
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
import { localEngine } from '@embedpdf/engine';

import './copy.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// On load: the document's square, selected, ready to copy.
function SelectSquare() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const square = annotation.list().find((each) => each.nm === 'square');
    if (!square) return;
    annotation.selection.set([square.ref]);
    stage.reveal(square.page, { rect: square.rect });
  }, [annotation, stage, ready]);

  return null;
}

// A read passed to create() makes the same annotation again, here on the next page.
function CopyButton() {
  const annotation = useAnnotation();
  const stage = useStage();
  const pages = usePageList();
  const { selected } = useAnnotationState();
  const [status, setStatus] = useState('');
  const [first] = selected;
  const index = first
    ? pages.findIndex((page) => page.ref.objectNumber === first.page.objectNumber)
    : -1;
  const next = pages[index + 1];

  const copyToNextPage = async () => {
    if (!first || !next) return;
    const copy = annotation.get(first.ref)!;
    const { annotation: made } = await annotation.create(next.ref, copy, undefined, {
      select: true, // so the next click copies the copy, a page further
    });
    stage.reveal(next.ref, { rect: made.rect });
    setStatus(`Copied to page ${next.index + 1}`);
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={selected.length !== 1 || !next}
        onClick={() => void copyToNextPage()}
      >
        Copy to the next page
      </button>
      <span className="spacer" />
      <output className="readout">
        {status || (first ? 'Ready to copy' : 'Select an annotation to copy')}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectSquare />
        <CopyButton />
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

import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { searchPlugin } from '@embedpdf/react/search';
import {
  AnnotationLayer,
  annotationKey,
  annotationPlugin,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import {
  redactionPlugin,
  usePendingRedactions,
  useRedaction,
  useRedactionState,
} from '@embedpdf/react/redaction';
import { localEngine } from '@embedpdf/engine';

import './review.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  searchPlugin(),
  annotationPlugin(),
  redactionPlugin(),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// On load: the author's name, and every "commercial" in the document.
function MarkSome() {
  const redaction = useRedaction();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void redaction
      .markArea(0, { x: 100, y: 508, width: 172, height: 50 })
      .then(() => redaction.markMatches({ text: 'commercial' }));
  }, [redaction, ready]);

  return null;
}

function PendingMarks() {
  const stage = useStage();
  const redaction = useRedaction();
  const marks = usePendingRedactions(); // the marks not applied yet, in page order
  const { pendingCount } = useRedactionState();

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="readout">
          {pendingCount} {pendingCount === 1 ? 'mark' : 'marks'}
        </span>
        <button
          type="button"
          className="button"
          disabled={!pendingCount}
          onClick={() => void redaction.clearPending()}
        >
          Remove all
        </button>
      </div>
      <ul className="marks">
        {marks.map((mark) => (
          <li key={annotationKey(mark.ref)} className="mark">
            <button
              type="button"
              className="mark-go"
              onClick={() => stage.reveal(mark.page, { rect: mark.bounds })}
            >
              <span className="mark-page">Page {mark.pageIndex + 1}</span>
              <span className="mark-kind">{mark.kind === 'text' ? 'Text' : 'Area'}</span>
            </button>
            <button
              type="button"
              className="button"
              disabled={!redaction.canUnmark(mark.ref)}
              onClick={() => void redaction.unmark([mark.ref])}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MarkSome />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <AnnotationLayer />
              </>
            )}
          </Stage>
          <PendingMarks />
        </div>
      </DocumentGate>
    </Viewer>
  );
}

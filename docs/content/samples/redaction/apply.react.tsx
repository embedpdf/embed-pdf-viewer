import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, saveFile, useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin, useAnnotationState } from '@embedpdf/react/annotation';
import { redactionPlugin, useRedaction, useRedactionState } from '@embedpdf/react/redaction';
import { localEngine } from '@embedpdf/engine';

import './apply.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  redactionPlugin(),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The cover's title, in page coordinates: the shapes drawn over it go with it.
const TITLE = { x: 100, y: 212, width: 392, height: 156 };

function ApplyBar() {
  const redaction = useRedaction();
  const documents = useDocuments();
  const { pendingCount, applying, lastResult } = useRedactionState();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const [asking, setAsking] = useState(false);
  const started = useRef(false);

  // On load: the title marked.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void redaction.markArea(0, TITLE);
  }, [redaction, ready]);

  // The other annotations applying removes too: they could show what was there.
  const { count } = redaction.estimateCollateral();

  if (asking) {
    return (
      <div className="toolbar confirm" role="alertdialog" aria-label="Redact for good?">
        <span className="readout">
          Redact {pendingCount} {pendingCount === 1 ? 'mark' : 'marks'}?{' '}
          {count > 0 &&
            `${count} ${count === 1 ? 'annotation' : 'annotations'} under them go too. `}
          This can’t be undone.
        </span>
        <span className="spacer" />
        <button type="button" className="button" onClick={() => setAsking(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="button danger"
          disabled={applying}
          onClick={() => void redaction.applyAll().finally(() => setAsking(false))}
        >
          Redact for good
        </button>
      </div>
    );
  }

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button danger"
        disabled={!pendingCount || !redaction.canApply()}
        onClick={() => setAsking(true)}
      >
        Redact…
      </button>
      <button
        type="button"
        className="button"
        disabled={!lastResult}
        title="A fresh file, without the earlier revision that still holds the content"
        onClick={() =>
          void documents
            .download(undefined, { mode: 'rewrite' })
            .then((bytes) => saveFile(bytes, 'redacted.pdf', 'application/pdf'))
        }
      >
        Download
      </button>
      <span className="spacer" />
      <output className="readout">
        {lastResult
          ? `Gone for good, with ${lastResult.removedAnnotationCount} other annotations`
          : `${pendingCount} ${pendingCount === 1 ? 'mark' : 'marks'} waiting`}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ApplyBar />
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

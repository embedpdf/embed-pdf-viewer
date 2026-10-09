import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin, useAnnotationState } from '@embedpdf/react/annotation';
import {
  redactionPlugin,
  usePendingRedactions,
  useRedaction,
  useRedactionState,
} from '@embedpdf/react/redaction';
import { localEngine } from '@embedpdf/engine';

import './label.css';

const engine = localEngine();
// What applying paints over every mark: a dark blue area, its label in white.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  redactionPlugin({ overlay: { fill: '#1a2748', text: { color: '#ffffff' } } }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The cover's subtitle, in page coordinates.
const SUBTITLE = { x: 100, y: 378, width: 352, height: 114 };

function LabelBar() {
  const redaction = useRedaction();
  const stage = useStage();
  const { applying, lastResult } = useRedactionState();
  const [mark] = usePendingRedactions();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const [text, setText] = useState('Classified');
  const started = useRef(false);

  // On load: the subtitle marked, with a label that fills the area.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void redaction
      .markArea(0, SUBTITLE)
      .then(({ mark }) =>
        redaction.updateLabel(mark.ref, { overlayText: 'Classified', repeat: true }),
      )
      .then(() => stage.reveal(0, { rect: SUBTITLE }));
  }, [redaction, stage, ready]);

  return (
    <div className="toolbar">
      <form
        className="label-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (mark) void redaction.updateLabel(mark.ref, { overlayText: text.trim() || null });
        }}
      >
        <input
          className="field"
          aria-label="Label"
          value={text}
          disabled={!mark}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="button" disabled={!mark}>
          Set label
        </button>
      </form>
      <label className="label">
        <input
          type="checkbox"
          checked={mark?.repeat ?? false}
          disabled={!mark}
          onChange={(event) =>
            mark && void redaction.updateLabel(mark.ref, { repeat: event.target.checked })
          }
        />
        Repeat
      </label>
      <button
        type="button"
        className="button danger"
        disabled={!mark || applying}
        onClick={() => void redaction.applyAll()}
      >
        Redact
      </button>
      <span className="spacer" />
      <output className="readout">
        {lastResult ? 'The label is part of the page now' : 'Redact to see the label'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <LabelBar />
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

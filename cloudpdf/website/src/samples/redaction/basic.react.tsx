import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { AnnotationLayer, annotationPlugin, useAnnotationState } from '@embedpdf/react/annotation';
import { redactionPlugin, useRedaction, useRedactionState } from '@embedpdf/react/redaction';
import { cloudEngine } from '@cloudpdf/engine';

import './basic.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// The selection plugin lets the redact tool mark the text you select.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
  redactionPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The author's name on the cover, in page coordinates.
const AUTHOR = { x: 100, y: 508, width: 172, height: 50 };

function RedactBar() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const stage = useStage();
  const redaction = useRedaction();
  const { pendingCount, applying } = useRedactionState();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const started = useRef(false);

  // On load: the author's name marked, and the redact tool on.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void redaction.markArea(0, AUTHOR).then(() => stage.reveal(0, { rect: AUTHOR }));
    interaction.activateTool('redact');
  }, [redaction, interaction, stage, ready]);

  const marking = activeToolId === 'redact';

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        aria-pressed={marking}
        onClick={() => interaction.activateTool(marking ? 'pointer' : 'redact')}
      >
        Mark for redaction
      </button>
      <button
        type="button"
        className="button danger"
        disabled={!pendingCount || applying}
        onClick={() => void redaction.applyAll()}
      >
        Redact {pendingCount} {pendingCount === 1 ? 'mark' : 'marks'}
      </button>
      <span className="spacer" />
      <output className="readout">
        {marking ? 'Select text, or drag over an area' : 'Click a mark to move it'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <RedactBar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

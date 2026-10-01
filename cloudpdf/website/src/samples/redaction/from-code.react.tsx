import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin, useSelectionState } from '@embedpdf/react/selection';
import { searchPlugin } from '@embedpdf/react/search';
import { AnnotationLayer, annotationPlugin, useAnnotationState } from '@embedpdf/react/annotation';
import { redactionPlugin, useRedaction, useRedactionState } from '@embedpdf/react/redaction';
import { cloudEngine } from '@cloudpdf/engine';

import './from-code.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// Marking matches runs a search; marking the selected text needs a selection.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
  annotationPlugin(),
  redactionPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function MarkFromCode() {
  const redaction = useRedaction();
  const { pendingCount } = useRedactionState();
  const { hasSelection } = useSelectionState();
  const currentPage = useStageState((state) => state.currentPageIndex);
  const ready = useAnnotationState((state) => state.status === 'ready');
  const [text, setText] = useState('EmbedPDF');
  const started = useRef(false);

  // On load: every "EmbedPDF" in the document.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void redaction.markMatches({ text: 'EmbedPDF' });
  }, [redaction, ready]);

  return (
    <div className="toolbar">
      <form
        className="query"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) void redaction.markMatches({ text: text.trim() });
        }}
      >
        <input
          className="field"
          type="search"
          aria-label="Text to mark"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="button" disabled={!text.trim()}>
          Every match
        </button>
      </form>
      <button
        type="button"
        className="button"
        disabled={!hasSelection}
        title="Select some text on the page first"
        onClick={() => void redaction.markSelection()}
      >
        The selected text
      </button>
      <button type="button" className="button" onClick={() => void redaction.markPage(currentPage)}>
        This page
      </button>
      <button
        type="button"
        className="button"
        disabled={!pendingCount}
        onClick={() => void redaction.clearPending()}
      >
        Remove all
      </button>
      <span className="spacer" />
      <output className="readout">
        {pendingCount} {pendingCount === 1 ? 'mark' : 'marks'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MarkFromCode />
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

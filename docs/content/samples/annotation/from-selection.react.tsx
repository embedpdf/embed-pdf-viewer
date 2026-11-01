import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionLayer,
  selectionPlugin,
  useSelection,
  useSelectionState,
} from '@embedpdf/react/selection';
import { AnnotationLayer, annotationPlugin, useAnnotation } from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './from-selection.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

// [!doc-source article]
const article = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/article.pdf');
  return { kind: 'bytes', id: 'article', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// On page 1: the characters of the title's first line, and where it is.
const SENTENCE = { start: 6, count: 33 };
const SENTENCE_BOX = { x: 60, y: 102, width: 363, height: 31 };

const MARKUP = [
  { tool: 'highlight', label: 'Highlight' },
  { tool: 'underline', label: 'Underline' },
  { tool: 'strikeout', label: 'Strike out' },
  { tool: 'squiggly', label: 'Squiggly' },
];

// The selected text becomes a mark, one per page; the selection is cleared afterwards.
function MarkupToolbar() {
  const annotation = useAnnotation();
  const selection = useSelection();
  const { hasSelection } = useSelectionState();
  const stage = useStage();
  const page = usePageList()[0]?.ref;
  const [status, setStatus] = useState('');

  // On load: the sentence is selected, ready to mark, and in view.
  useEffect(() => {
    if (!page) return;
    selection.select({ page, ...SENTENCE });
    stage.reveal(page, { rect: SENTENCE_BOX });
  }, [selection, stage, page]);

  const mark = async (tool: string, label: string) => {
    const { annotations } = await annotation.createFromSelection(tool);
    setStatus(`${label}: ${annotations.length} made`);
  };

  return (
    <div className="toolbar">
      {MARKUP.map(({ tool, label }) => (
        <button
          key={tool}
          type="button"
          className="button"
          disabled={!hasSelection}
          onClick={() => void mark(tool, label)}
        >
          {label}
        </button>
      ))}
      <span className="spacer" />
      <output className="readout">
        {hasSelection ? 'Text selected' : status || 'Select text'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: article }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MarkupToolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

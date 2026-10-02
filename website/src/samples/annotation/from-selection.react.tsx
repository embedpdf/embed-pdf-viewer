import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
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

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// On the cover: the characters of the title's first line.
const FIRST_LINE = { start: 10, count: 17 };

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
  const cover = usePageList()[0]?.ref;
  const [status, setStatus] = useState('');

  // On load: the title's first line is selected, ready to mark.
  useEffect(() => {
    if (cover) selection.select({ page: cover, ...FIRST_LINE });
  }, [selection, cover]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MarkupToolbar />
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

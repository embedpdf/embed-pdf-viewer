import { useEffect } from 'react';
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
import { localEngine } from '@embedpdf/engine';

import './programmatic.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

// On the cover: the characters of its title, and a point on its word "Viewers", in page coordinates.
const TITLE = { start: 10, count: 52 };
const POINT = { x: 260, y: 242 };

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Every button selects on the cover, the first page: by its ref, or by its index, 0.
function SelectionToolbar() {
  const selection = useSelection();
  const { hasSelection, range, pages } = useSelectionState();
  const cover = usePageList()[0]?.ref;

  // The title is selected on load.
  useEffect(() => {
    if (cover) selection.select({ page: cover, ...TITLE });
  }, [selection, cover]);

  const canSelect = selection.canSelect();
  let summary = 'Nothing selected';
  if (pages.length > 1) summary = `On ${pages.length} pages`;
  else if (range) summary = `${range.end.index - range.start.index} characters`;

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!canSelect || !cover}
        onClick={() => cover && selection.select({ page: cover, ...TITLE })}
      >
        Title
      </button>
      <button
        type="button"
        className="button"
        disabled={!canSelect}
        onClick={() => selection.selectWordAt(0, POINT)}
      >
        Word
      </button>
      <button
        type="button"
        className="button"
        disabled={!canSelect}
        onClick={() => selection.selectLineAt(0, POINT)}
      >
        Line
      </button>
      <button
        type="button"
        className="button"
        disabled={!canSelect}
        onClick={() => selection.selectPage(0)}
      >
        Page
      </button>
      <button
        type="button"
        className="button"
        disabled={!canSelect}
        onClick={() => selection.selectAll()}
      >
        Everything
      </button>
      <button
        type="button"
        className="button"
        disabled={!hasSelection}
        onClick={() => selection.clear()}
      >
        Clear
      </button>
      <output className="badge">{summary}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectionToolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

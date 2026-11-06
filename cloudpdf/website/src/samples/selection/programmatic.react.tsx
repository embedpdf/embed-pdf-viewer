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
import { cloudEngine } from '@cloudpdf/engine';

import './programmatic.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

// On the cover: the characters of its first word, "Documents", and a point on its word "web",
// in page coordinates.
const FIRST_WORD = { start: 36, count: 9 };
const POINT = { x: 260, y: 242 };

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

// Every button selects on the cover, the first page: by its ref, or by its index, 0.
function SelectionToolbar() {
  const selection = useSelection();
  const { hasSelection, range, pages } = useSelectionState();
  const cover = usePageList()[0]?.ref;

  // The first word is selected on load.
  useEffect(() => {
    if (cover) selection.select({ page: cover, ...FIRST_WORD });
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
        onClick={() => cover && selection.select({ page: cover, ...FIRST_WORD })}
      >
        Characters
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
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

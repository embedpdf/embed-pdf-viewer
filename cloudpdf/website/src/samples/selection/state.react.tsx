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

import './state.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Every field of the selection's state, as it changes.
function SelectionStatus() {
  const { hasSelection, isSelecting, range, pages } = useSelectionState();

  return (
    <dl className="status">
      <div className="field">
        <dt>hasSelection</dt>
        <dd>{String(hasSelection)}</dd>
      </div>
      <div className="field" data-live={isSelecting}>
        <dt>isSelecting</dt>
        <dd>{String(isSelecting)}</dd>
      </div>
      <div className="field">
        <dt>pages</dt>
        <dd>{pages.length === 1 ? '1 page' : `${pages.length} pages`}</dd>
      </div>
      <div className="field">
        <dt>range</dt>
        <dd>{range ? `${range.start.index} → ${range.end.index}` : 'null'}</dd>
      </div>
    </dl>
  );
}

// Something selected on load: the title on the cover.
function SelectTitle() {
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;

  useEffect(() => {
    if (cover) selection.select({ page: cover, start: 10, count: 52 });
  }, [selection, cover]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectTitle />
        <SelectionStatus />
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

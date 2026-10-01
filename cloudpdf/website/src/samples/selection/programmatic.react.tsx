import { Viewer, DocumentGate, useSelector } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePageList, usePages } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionLayer,
  SelectionToken,
  selectionPlugin,
  useSelection,
} from '@embedpdf/react/selection';
import { cloudEngine } from '@cloudpdf/engine';

import './programmatic.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function SelectionToolbar() {
  const { currentPage } = usePages();
  const { pages } = usePageList();
  const selection = useSelection();
  const hasSelection = useSelector(SelectionToken, (value) => value.hasSelection());

  const selectCurrentPage = () => {
    const page = pages[currentPage];
    if (page) selection.select({ page: page.ref, start: 0, count: 120 });
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        onClick={selectCurrentPage}
        disabled={!selection.canSelect()}
      >
        Select first 120 characters
      </button>
      <button
        type="button"
        className="button"
        onClick={() => selection.selectAll()}
        disabled={!selection.canSelect()}
      >
        Select all
      </button>
      <button
        type="button"
        className="button"
        onClick={() => selection.clear()}
        disabled={!hasSelection}
      >
        Clear
      </button>
      <span className="spacer" />
      <output className="badge">{hasSelection ? 'Selection active' : 'Nothing selected'}</output>
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

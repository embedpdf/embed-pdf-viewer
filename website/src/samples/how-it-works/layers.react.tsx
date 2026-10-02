import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { SearchLayer, searchPlugin, useSearch } from '@embedpdf/react/search';
import {
  SelectionLayer,
  SelectionMenu,
  selectionPlugin,
  useSelection,
} from '@embedpdf/react/selection';
import { localEngine } from '@embedpdf/engine';

import './layers.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Something on every layer on load: the matches of a search, and the title selected.
function OnLoad() {
  const search = useSearch();
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;

  useEffect(() => {
    void search.search({ text: 'PDF' });
  }, [search]);
  useEffect(() => {
    if (cover) selection.select({ page: cover, start: 10, count: 52 });
  }, [selection, cover]);

  return null;
}

function Menu() {
  const selection = useSelection();
  return (
    <div className="menu">
      <button type="button" onClick={() => selection.clear()}>
        Clear the selection
      </button>
    </div>
  );
}

export default function App() {
  const [showSearch, setShowSearch] = useState(true);
  const [showSelection, setShowSelection] = useState(true);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <OnLoad />
        <div className="toolbar">
          <label className="option">
            <input
              type="checkbox"
              checked={showSearch}
              onChange={(event) => setShowSearch(event.target.checked)}
            />
            Search matches
          </label>
          <label className="option">
            <input
              type="checkbox"
              checked={showSelection}
              onChange={(event) => setShowSelection(event.target.checked)}
            />
            Text selection
          </label>
        </div>
        {/* Layers draw inside each page, later ones on top; the overlay floats above them. */}
        <Stage
          className="stage"
          overlay={
            showSelection && (
              <SelectionMenu>
                <Menu />
              </SelectionMenu>
            )
          }
        >
          {() => (
            <>
              <RenderLayer />
              {showSearch && <SearchLayer />}
              {showSelection && <SelectionLayer />}
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

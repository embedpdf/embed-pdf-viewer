import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { outlinePlugin, useOutline, useOutlineState } from '@embedpdf/react/outline';
import { cloudEngine } from '@cloudpdf/engine';

import './bookmarks.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), outlinePlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Bookmarks the reader adds: each one goes to the place in view when it's added.
function Bookmarks() {
  const outline = useOutline();
  const { rows, current, selected, canEdit } = useOutlineState();
  const { currentPageIndex } = useStageState();
  const selectedNumber = selected[0]?.objectNumber;

  return (
    <aside className="bookmarks">
      <header className="bookmarks-header">
        <h3 className="bookmarks-title">Bookmarks</h3>
        <button
          type="button"
          className="button primary"
          disabled={!canEdit}
          onClick={() =>
            outline.create({ title: `Page ${currentPageIndex + 1}` }, { select: true })
          }
        >
          Add
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="empty">Scroll to a page, then add a bookmark.</p>
      ) : (
        <ul className="list">
          {rows.map(({ item }) => {
            const number = item.ref.objectNumber;
            return (
              <li
                key={number}
                className="row"
                data-current={number === current?.objectNumber || undefined}
                data-selected={number === selectedNumber || undefined}
              >
                <button
                  type="button"
                  className="row-title"
                  onClick={() => {
                    outline.select([item.ref]);
                    outline.activate(item.ref);
                  }}
                >
                  {item.title}
                </button>
                <button
                  type="button"
                  className="row-delete"
                  aria-label={`Delete ${item.title}`}
                  disabled={!canEdit}
                  onClick={() => outline.delete([item.ref])}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="layout">
          <Bookmarks />
          <Stage className="stage">{() => <RenderLayer />}</Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}

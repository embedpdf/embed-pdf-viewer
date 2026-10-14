import { useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput, PageRef } from '@embedpdf/react/runtime';
import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin, usePageEdit } from '@embedpdf/react/page-edit';
import { localEngine } from '@embedpdf/engine';

import './organize.css';

const engine = localEngine();
const plugins = [renderPlugin(), pageEditPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const sameRef = (left: PageRef, right: PageRef) => left.objectNumber === right.objectNumber;

// Every page as a card. Click cards to select them; the toolbar edits every selected page at once.
function PageOrganizer() {
  const pageEdit = usePageEdit();
  const pages = usePageList();
  const canEdit = pageEdit.canEdit();
  // The second and third pages start selected. Refs, not indexes: they still name the
  // same pages after a reorder.
  const [selected, setSelected] = useState(() => pages.slice(1, 3).map((page) => page.ref));

  const isSelected = (page: PageRef) => selected.some((ref) => sameRef(ref, page));
  const toggle = (page: PageRef) =>
    setSelected(
      isSelected(page) ? selected.filter((ref) => !sameRef(ref, page)) : [...selected, page],
    );
  const count = selected.length;

  return (
    <>
      <div className="toolbar">
        <output className="readout">
          {count} of {pages.length} selected
        </output>
        <span className="spacer" />
        <button
          type="button"
          className="button"
          disabled={!canEdit || count === 0}
          onClick={() => pageEdit.rotateBy(selected, -90)}
        >
          ⟲ Rotate left
        </button>
        <button
          type="button"
          className="button"
          disabled={!canEdit || count === 0}
          onClick={() => pageEdit.rotateBy(selected, 90)}
        >
          ⟳ Rotate right
        </button>
        <button
          type="button"
          className="button"
          disabled={!canEdit || count === 0}
          onClick={() => pageEdit.reorder(selected, 'start')}
        >
          Move to front
        </button>
        <button
          type="button"
          className="button danger"
          // A document keeps at least one page.
          disabled={!canEdit || count === 0 || count === pages.length}
          onClick={async () => {
            await pageEdit.delete(selected);
            setSelected([]);
          }}
        >
          Delete
        </button>
      </div>
      <ol className="pages">
        {pages.map((page) => (
          <li key={page.ref.objectNumber}>
            <button
              type="button"
              className="card"
              aria-pressed={isSelected(page.ref)}
              onClick={() => toggle(page.ref)}
            >
              <PageView page={page.ref} width={120} className="thumbnail">
                <RenderLayer />
              </PageView>
              <span className="label">
                Page {page.index + 1}
                {page.rotation !== 0 && <span className="turn"> · {page.rotation}°</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PageOrganizer />
      </DocumentGate>
    </Viewer>
  );
}

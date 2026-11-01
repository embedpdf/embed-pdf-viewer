import { useEffect } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput, PageRef } from '@embedpdf/react/runtime';
import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin, usePageEdit, usePageEditState } from '@embedpdf/react/page-edit';
import { cloudEngine } from '@cloudpdf/engine';

import './organize.css';

const engine = cloudEngine();
const plugins = [renderPlugin(), pageEditPlugin()];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

const sameRef = (left: PageRef, right: PageRef) => left.objectNumber === right.objectNumber;

// Every page as a card. Click cards to select them; the toolbar edits every selected page at once.
function PageOrganizer() {
  const pageEdit = usePageEdit();
  const pages = usePageList();
  const { selected, canEdit } = usePageEditState();
  // The second and third pages start selected. The selection holds refs: it names the same
  // pages after a reorder, and a deleted page leaves it.
  useEffect(() => {
    pageEdit.select([1, 2]);
  }, [pageEdit]);

  const isSelected = (page: PageRef) => selected.some((ref) => sameRef(ref, page));
  const toggle = (page: PageRef) =>
    pageEdit.select(
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
          onClick={() => pageEdit.delete(selected)}
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PageOrganizer />
      </DocumentGate>
    </Viewer>
  );
}

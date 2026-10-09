import { useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin, usePageEdit } from '@embedpdf/react/page-edit';
import { cloudEngine } from '@cloudpdf/engine';

import './reorder.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [renderPlugin(), pageEditPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Pick a page, then move it. Each button uses another placement.
function PageOrder() {
  const pageEdit = usePageEdit();
  const pages = usePageList();
  // The last page starts selected. Its ref names it wherever it moves.
  const [selected, setSelected] = useState(() => pages[pages.length - 1]?.ref ?? null);

  const page = pages.find((each) => each.ref.objectNumber === selected?.objectNumber);
  const before = page && pages[page.index - 1];
  const after = page && pages[page.index + 1];
  const canEdit = pageEdit.canEdit();

  return (
    <>
      <div className="toolbar">
        <output className="readout">
          {page ? `Page ${page.index + 1} selected` : 'Pick a page'}
        </output>
        <span className="spacer" />
        <button
          type="button"
          className="button"
          disabled={!canEdit || !before}
          onClick={() => page && pageEdit.reorder([page.ref], 'start')}
        >
          ⇤ To the front
        </button>
        <button
          type="button"
          className="button"
          disabled={!canEdit || !before}
          onClick={() => page && before && pageEdit.reorder([page.ref], { before: before.ref })}
        >
          ← Earlier
        </button>
        <button
          type="button"
          className="button"
          disabled={!canEdit || !after}
          onClick={() => page && after && pageEdit.reorder([page.ref], { after: after.ref })}
        >
          Later →
        </button>
        <button
          type="button"
          className="button"
          disabled={!canEdit || !after}
          onClick={() => page && pageEdit.reorder([page.ref], 'end')}
        >
          To the back ⇥
        </button>
      </div>
      <ol className="strip">
        {pages.map((each) => (
          <li key={each.ref.objectNumber}>
            <button
              type="button"
              className="card"
              aria-pressed={each.ref.objectNumber === selected?.objectNumber}
              onClick={() => setSelected(each.ref)}
            >
              <PageView page={each.ref} width={110} className="thumbnail">
                <RenderLayer />
              </PageView>
              <span className="label">{each.index + 1}</span>
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
        <PageOrder />
      </DocumentGate>
    </Viewer>
  );
}

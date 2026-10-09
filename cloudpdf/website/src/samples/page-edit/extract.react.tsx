import { useState } from 'react';
import { Viewer, DocumentGate, saveFile, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput, PageRef } from '@embedpdf/react/runtime';
import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin, usePageEdit } from '@embedpdf/react/page-edit';
import { cloudEngine } from '@cloudpdf/engine';

import './extract.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [renderPlugin(), pageEditPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Tick pages, then download them as a PDF of their own. This document doesn't change.
function ExtractPages() {
  const pageEdit = usePageEdit();
  const pages = usePageList();
  // The middle two pages start ticked.
  const [ticked, setTicked] = useState(() => pages.slice(1, 3).map((page) => page.ref));
  const [saved, setSaved] = useState<string | null>(null);

  const isTicked = (ref: PageRef) => ticked.some((each) => each.objectNumber === ref.objectNumber);
  const toggle = (ref: PageRef) =>
    setTicked(
      isTicked(ref)
        ? ticked.filter((each) => each.objectNumber !== ref.objectNumber)
        : [...ticked, ref],
    );

  // In document order, whatever order they were ticked in.
  const chosen = pages.filter((page) => isTicked(page.ref)).map((page) => page.ref);

  const download = async () => {
    const bytes = await pageEdit.extract(chosen);
    saveFile(bytes, 'pages.pdf');
    setSaved(`pages.pdf · ${chosen.length} pages · ${Math.round(bytes.byteLength / 1024)} KB`);
  };

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          className="button primary"
          disabled={chosen.length === 0 || !pageEdit.canExtract()}
          onClick={download}
        >
          Download {chosen.length === 1 ? '1 page' : `${chosen.length} pages`} as a PDF
        </button>
        <output className="readout">{saved}</output>
      </div>
      <ol className="grid">
        {pages.map((page) => (
          <li key={page.ref.objectNumber}>
            <label className="card" data-ticked={isTicked(page.ref)}>
              <PageView page={page.ref} width={110} className="thumbnail">
                <RenderLayer />
              </PageView>
              <span className="label">
                <input
                  type="checkbox"
                  checked={isTicked(page.ref)}
                  onChange={() => toggle(page.ref)}
                />
                Page {page.index + 1}
              </span>
            </label>
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
        <ExtractPages />
      </DocumentGate>
    </Viewer>
  );
}

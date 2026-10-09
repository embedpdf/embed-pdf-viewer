import { useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput, PageRef } from '@embedpdf/react/runtime';
import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './picker.css';

const engine = localEngine();
const plugins = [renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function PagePicker() {
  const pages = usePageList();
  const [picked, setPicked] = useState<PageRef | null>(null);
  // A ref follows its page when pages move, so it's what you keep.
  const shown = picked ?? pages[0]?.ref ?? null;

  return (
    <div className="picker">
      <div className="choices" role="listbox" aria-label="Pages">
        {pages.map((page) => (
          <button
            key={page.ref.objectNumber}
            type="button"
            role="option"
            className="choice"
            aria-selected={page.ref.objectNumber === shown?.objectNumber}
            onClick={() => setPicked(page.ref)}
          >
            <PageView page={page.ref} width={84}>
              <RenderLayer />
            </PageView>
            <span className="number">{page.label ?? page.index + 1}</span>
          </button>
        ))}
      </div>
      <div className="shown">
        {shown ? (
          <PageView page={shown} width={300}>
            <RenderLayer />
          </PageView>
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PagePicker />
      </DocumentGate>
    </Viewer>
  );
}

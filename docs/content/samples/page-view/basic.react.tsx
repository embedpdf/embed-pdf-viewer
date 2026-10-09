import { useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();
// No Stage: a page on its own needs only the render plugin.
const plugins = [renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A card that shows one page, like a preview next to a search result or a comment.
function PageCard() {
  const pages = usePageList();
  const [index, setIndex] = useState(0);
  const page = pages[index];

  return (
    <figure className="card">
      <PageView page={index} width={220} className="page">
        <RenderLayer />
      </PageView>
      <figcaption className="caption">
        <strong className="title">Page {page?.label ?? index + 1}</strong>
        {page ? (
          <span className="detail">
            {Math.round(page.size.width)} × {Math.round(page.size.height)} points
          </span>
        ) : null}
        <span className="pager">
          <button
            type="button"
            className="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            ‹ Previous
          </button>
          <button
            type="button"
            className="button"
            disabled={index >= pages.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            Next ›
          </button>
        </span>
      </figcaption>
    </figure>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PageCard />
      </DocumentGate>
    </Viewer>
  );
}

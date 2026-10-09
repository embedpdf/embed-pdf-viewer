import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput, PageRef } from '@embedpdf/react/runtime';
import { renderPlugin, useRender } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './render-page.css';

const engine = localEngine();
// No Stage: these pictures are plain images, rendered on demand.
const plugins = [renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

interface Thumbnail {
  page: PageRef;
  url: string;
}

function PageImages() {
  const render = useRender();
  const pages = usePageList();
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  // A small picture of every page, a few rendered at a time.
  useEffect(() => {
    const controller = new AbortController();
    const revokes: (() => void)[] = [];
    (async () => {
      const { applied } = await render.renderPages(
        pages.map((page) => page.ref),
        { width: 120, signal: controller.signal },
      );
      const ready = await Promise.all(
        applied.map(async ({ page, image }) => {
          const { url, revoke } = await image.objectUrl();
          revokes.push(revoke);
          return { page, url };
        }),
      );
      if (!controller.signal.aborted) setThumbnails(ready);
    })().catch(() => {
      // cancelled: the document closed or the list changed
    });
    return () => {
      controller.abort();
      revokes.forEach((revoke) => revoke());
    };
  }, [render, pages]);

  // The chosen page, exactly 640 pixels wide.
  useEffect(() => {
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    (async () => {
      const image = await render.renderPage(selected, { width: 640, signal: controller.signal });
      const object = await image.objectUrl();
      if (controller.signal.aborted) {
        object.revoke();
        return;
      }
      revoke = object.revoke;
      setPreview(object.url);
    })().catch(() => {
      // cancelled: another page was picked
    });
    return () => {
      controller.abort();
      revoke?.();
    };
  }, [render, selected]);

  return (
    <div className="images">
      <div className="strip" role="listbox" aria-label="Pages">
        {thumbnails.map(({ page, url }, index) => (
          <button
            key={page.objectNumber}
            type="button"
            role="option"
            className="thumbnail"
            aria-selected={index === selected}
            onClick={() => setSelected(index)}
          >
            <img src={url} alt={`Page ${index + 1}`} />
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      <div className="preview">
        {preview ? <img src={preview} alt={`Page ${selected + 1}, 640 pixels wide`} /> : null}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PageImages />
      </DocumentGate>
    </Viewer>
  );
}

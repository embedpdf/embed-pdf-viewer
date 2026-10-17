import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { annotationPlugin, useAnnotation } from '@embedpdf/react/annotation';
import { LinkLayer, linkPlugin } from '@embedpdf/react/link';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();
// The annotation plugin is only here to make the links below.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  linkPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Where the two links go on the first page, in page coordinates.
const TO_PAGE_3 = { x: 72, y: 24, width: 160, height: 28 };
const TO_WEBSITE = { x: 250, y: 24, width: 190, height: 28 };

// Made on load, since the document has none: a label the page shows, and a link over it.
function AddLinks() {
  const annotation = useAnnotation();
  const pages = usePageList();
  const added = useRef(false);

  useEffect(() => {
    const [first, , third] = pages;
    if (!first || !third || added.current) return;
    added.current = true;
    const label = (text: string, box: typeof TO_PAGE_3) =>
      annotation.create(first.ref, {
        subtype: 'free-text',
        box,
        contents: text,
        fontSize: 13,
        fontColor: '#054fb3',
        interiorColor: '#e8f1ff',
        color: '#7db6ff',
        strokeWidth: 1,
      });
    void (async () => {
      await label('Go to page 3 →', TO_PAGE_3);
      await label('Open embedpdf.com ↗', TO_WEBSITE);
      await annotation.create(first.ref, {
        subtype: 'link',
        rect: TO_PAGE_3,
        target: { kind: 'goto', destination: { kind: 'fit', page: third.ref } },
      });
      await annotation.create(first.ref, {
        subtype: 'link',
        rect: TO_WEBSITE,
        target: { kind: 'uri', uri: 'https://www.embedpdf.com' },
      });
    })();
  }, [annotation, pages]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddLinks />
        <p className="hint">
          Two links at the top of the first page. Click one, or press Tab to reach it and Enter to
          follow it.
        </p>
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <LinkLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

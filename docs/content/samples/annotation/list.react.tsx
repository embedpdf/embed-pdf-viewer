import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationKey,
  annotationPlugin,
  useAnnotation,
  useAnnotationList,
  useAnnotationState,
  type AnnotationSubtype,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './list.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A line of text, as the four corners a highlight takes.
const quad = (x: number, y: number, width: number, height: number) => ({
  upperLeft: { x, y },
  upperRight: { x: x + width, y },
  lowerLeft: { x, y: y + height },
  lowerRight: { x: x + width, y: y + height },
});

// On load: highlights, notes and a rectangle on the first two pages.
function AddAnnotations() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const [cover, second] = usePageList();
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || !second || added.current) return;
    added.current = true;
    void annotation.create(cover.ref, {
      subtype: 'highlight',
      quadPoints: [quad(106, 218, 352, 49)],
      color: '#ffcd45',
      contents: 'The title',
    });
    void annotation.create(cover.ref, {
      subtype: 'text',
      rect: { x: 470, y: 232, width: 20, height: 20 },
      contents: 'Can we shorten it?',
      color: '#facc15',
    });
    void annotation.create(second.ref, {
      subtype: 'highlight',
      quadPoints: [quad(57, 57, 242, 36), quad(57, 93, 265, 36)],
      color: '#ffcd45',
      contents: 'The opening line',
    });
    void annotation.create(second.ref, {
      subtype: 'square',
      box: { x: 52, y: 580, width: 470, height: 64 },
      color: '#e5484d',
      strokeWidth: 2,
      contents: 'Rewrite this paragraph',
    });
  }, [annotation, ready, cover, second]);

  return null;
}

const KINDS: { label: string; subtype?: AnnotationSubtype }[] = [
  { label: 'All' },
  { label: 'Highlights', subtype: 'highlight' },
  { label: 'Notes', subtype: 'text' },
  { label: 'Rectangles', subtype: 'square' },
];

// The annotations of one kind, in drawing order. A click shows one on its page.
function AnnotationList() {
  const [kind, setKind] = useState(KINDS[0]!);
  const annotations = useAnnotationList(kind.subtype ? { subtype: kind.subtype } : undefined);
  const pages = usePageList();
  const stage = useStage();
  const annotation = useAnnotation();

  const pageNumberOf = (objectNumber: number) =>
    pages.findIndex((page) => page.ref.objectNumber === objectNumber) + 1;

  return (
    <div className="panel">
      <div className="segmented" role="group" aria-label="Kind">
        {KINDS.map((each) => (
          <button
            key={each.label}
            type="button"
            aria-pressed={each === kind}
            onClick={() => setKind(each)}
          >
            {each.label}
          </button>
        ))}
      </div>
      <p className="count">{annotations.length} found</p>
      <ul className="items">
        {annotations.map((each) => (
          <li key={annotationKey(each.ref)}>
            <button
              type="button"
              className="item"
              onClick={() => {
                stage.reveal(each.page, { rect: each.rect });
                annotation.selection.set([each.ref]);
              }}
            >
              <span className="kind">
                {each.subtype} · page {pageNumberOf(each.page.objectNumber)}
              </span>
              <span>{each.contents ?? '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddAnnotations />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer annotations={false} />
                <AnnotationLayer />
              </>
            )}
          </Stage>
          <AnnotationList />
        </div>
      </DocumentGate>
    </Viewer>
  );
}

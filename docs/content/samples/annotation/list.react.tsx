import { useState } from 'react';
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
  type AnnotationSubtype,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './list.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
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

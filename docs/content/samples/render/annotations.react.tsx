import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin, useAnnotation } from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './annotations.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A rectangle on the first page, made on load so there's an annotation to show.
function AddRectangle() {
  const annotation = useAnnotation();
  const firstPage = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!firstPage || added.current) return;
    added.current = true;
    void annotation.create(firstPage, {
      subtype: 'square',
      box: { x: 72, y: 96, width: 300, height: 140 },
      color: '#e11d48',
      interiorColor: '#ffe4e6',
      opacity: 0.7,
      strokeWidth: 3,
    });
  }, [annotation, firstPage]);

  return null;
}

type Painter = 'picture' | 'layer';

export default function App() {
  const [painter, setPainter] = useState<Painter>('picture');

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddRectangle />
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Who draws the annotations">
            <button
              type="button"
              aria-pressed={painter === 'picture'}
              onClick={() => setPainter('picture')}
            >
              In the page picture
            </button>
            <button
              type="button"
              aria-pressed={painter === 'layer'}
              onClick={() => setPainter('layer')}
            >
              Drawn by the annotation layer
            </button>
          </div>
          <p className="hint">
            {painter === 'picture'
              ? 'Part of the picture: it can’t be picked up.'
              : 'Left out of the picture: click it, then drag it.'}
          </p>
        </div>
        <Stage className="stage">
          {() =>
            painter === 'picture' ? (
              <RenderLayer />
            ) : (
              <>
                <RenderLayer annotations={false} />
                <AnnotationLayer />
              </>
            )
          }
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

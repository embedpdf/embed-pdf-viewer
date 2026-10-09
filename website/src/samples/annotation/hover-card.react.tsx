import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { Anchored } from '@embedpdf/react/anchored';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationAnchor,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './hover-card.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// On load: two notes and a rectangle on the cover, each with a comment.
function AddAnnotations() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 470, y: 232, width: 20, height: 20 },
      contents: 'Can we shorten the title?',
      color: '#facc15',
    });
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 280, y: 520, width: 20, height: 20 },
      contents: 'Add the co-author',
      color: '#facc15',
    });
    void annotation.create(cover, {
      subtype: 'square',
      box: { x: 96, y: 376, width: 360, height: 118 },
      contents: 'This subtitle reads well',
      color: '#30a46c',
      strokeWidth: 3,
    });
  }, [annotation, ready, cover]);

  return null;
}

// A card next to the annotation under the pointer: who wrote it, and what.
function HoverCard() {
  const { hovered } = useAnnotationState(); // the annotation under the pointer, or null
  const anchor = useAnnotationAnchor(hovered?.ref ?? null);

  if (!hovered?.contents) return null;
  return (
    <Anchored anchor={anchor} placement="top">
      <div className="card">
        <strong>{hovered.author ?? 'Someone'}</strong>
        <p>{hovered.contents}</p>
      </div>
    </Anchored>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
      initialDocuments={[{ source: ebook }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddAnnotations />
        <p className="hint">Point at a note or the green rectangle</p>
        <Stage className="stage" overlay={<HoverCard />}>
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

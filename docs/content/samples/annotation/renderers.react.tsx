import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
  type AnnotationRenderer,
  type AnnotationRendererProps,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './renderers.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A note drawn as your app's comment bubble, the author's initials in it. It
// fills its frame, so the selection outline and the click area match it, and
// it turns with the annotation: a note stays upright on a turned page.
function CommentBubble({ annotation, hovered }: AnnotationRendererProps) {
  const initials = (annotation.author ?? '?')
    .split(' ')
    .map((word) => word[0])
    .join('');

  return <div className={hovered ? 'bubble bubble--hover' : 'bubble'}>{initials}</div>;
}

// Defined once, outside the component: the layer registers each entry.
const RENDERERS: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'text', component: CommentBubble },
];
const NONE: AnnotationRenderer[] = [];

// On load: two notes on the cover, 24 points square: 32 pixels at 100%.
function AddNotes() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 470, y: 228, width: 24, height: 24 },
      contents: 'Can we shorten the title?',
      color: '#facc15',
    });
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 280, y: 516, width: 24, height: 24 },
      contents: 'Add the co-author',
      color: '#facc15',
    });
  }, [annotation, ready, cover]);

  return null;
}

// A note keeps its size on screen and stays upright: turn the view to see it.
function TurnButton() {
  const stage = useStage();
  return (
    <button type="button" className="button" onClick={() => stage.rotateViewBy(90)}>
      Turn the view
    </button>
  );
}

export default function App() {
  const [mine, setMine] = useState(true);

  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
      initialDocuments={[{ source: ebook }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddNotes />
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Look">
            <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>
              Your look
            </button>
            <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>
              The PDF's look
            </button>
          </div>
          <TurnButton />
        </div>
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <AnnotationLayer renderers={mine ? RENDERERS : NONE} />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

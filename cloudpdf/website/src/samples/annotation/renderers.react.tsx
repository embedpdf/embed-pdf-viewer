import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
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
import { cloudEngine } from '@cloudpdf/engine';

import './renderers.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A sticky note drawn as your app's comment bubble: the author's initials.
function CommentBubble({ annotation, box, page, hovered }: AnnotationRendererProps) {
  const { x, y } = page.transform.pageToViewRect(box);
  const initials = (annotation.author ?? '?')
    .split(' ')
    .map((word) => word[0])
    .join('');

  return (
    <div className={hovered ? 'bubble bubble--hover' : 'bubble'} style={{ left: x, top: y }}>
      {initials}
    </div>
  );
}

// A rectangle marked "Approved" keeps its own look, with a badge on its corner.
function ApprovedBadge({ box, page, native, hovered }: AnnotationRendererProps) {
  const { x, y, width } = page.transform.pageToViewRect(box);

  return (
    <>
      {native}
      <div
        className={hovered ? 'badge badge--hover' : 'badge'}
        style={{ left: x + width - 12, top: y - 12 }}
      >
        ✓
      </div>
    </>
  );
}

// Defined once, outside the component: the layer registers each entry.
const RENDERERS: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'text', component: CommentBubble },
  {
    for: (annotation) => annotation.subtype === 'square' && annotation.contents === 'Approved',
    component: ApprovedBadge,
  },
];
const NONE: AnnotationRenderer[] = [];

// On load: two notes and an approved rectangle on the cover.
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
      contents: 'Approved',
      color: '#30a46c',
      strokeWidth: 3,
    });
  }, [annotation, ready, cover]);

  return null;
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
        <AddAnnotations />
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Look">
            <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>
              Your look
            </button>
            <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>
              The PDF's look
            </button>
          </div>
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

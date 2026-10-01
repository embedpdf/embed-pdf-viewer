import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationKey,
  annotationPlugin,
  useAnnotation,
  useAnnotationList,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './order.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const COLORS = [
  { color: '#e5484d', fill: '#ffd1d3' },
  { color: '#30a46c', fill: '#c9f0da' },
  { color: '#1e90ff', fill: '#cfe6ff' },
];

// On load: three filled rectangles stacked on the cover, the middle one selected.
function AddRectangles() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    COLORS.forEach(({ color, fill }, index) => {
      void annotation.create(
        cover,
        {
          subtype: 'square',
          box: { x: 300 + index * 50, y: 520 + index * 30, width: 160, height: 90 },
          color,
          interiorColor: fill,
          strokeWidth: 3,
        },
        undefined,
        { select: index === 1 },
      );
    });
  }, [annotation, ready, cover]);

  return null;
}

// The last annotation on a page is drawn on top.
function OrderControls() {
  const annotation = useAnnotation();
  const { selected } = useAnnotationState();
  const [first] = selected;
  const onPage = useAnnotationList(first ? { pages: [first.page] } : undefined);
  const position = first
    ? onPage.findIndex((a) => annotationKey(a.ref) === annotationKey(first.ref))
    : -1;

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!first || selected.length !== 1}
        onClick={() => first && annotation.move([first.ref], 0)}
      >
        Send to back
      </button>
      <button
        type="button"
        className="button"
        disabled={!first || selected.length !== 1}
        onClick={() => first && annotation.move([first.ref], onPage.length - 1)}
      >
        Bring to front
      </button>
      <span className="spacer" />
      <output className="readout">
        {position >= 0
          ? `${position + 1} of ${onPage.length}, from the back`
          : 'Select a rectangle'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddRectangles />
        <OrderControls />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

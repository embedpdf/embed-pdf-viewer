import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
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
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './order.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const layout: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// On load: the middle one of the document's three stacked rectangles, selected.
function SelectMiddle() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const stack2 = annotation.list().find((each) => each.nm === 'stack-2');
    if (!stack2) return;
    annotation.selection.set([stack2.ref]);
    stage.reveal(stack2.page, { rect: stack2.rect });
  }, [annotation, stage, ready]);

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
        onClick={() => first && annotation.reorder([first.ref], 'start')}
      >
        Send to back
      </button>
      <button
        type="button"
        className="button"
        disabled={!first || selected.length !== 1}
        onClick={() => first && annotation.reorder([first.ref], 'end')}
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: layout }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectMiddle />
        <OrderControls />
        <Stage className="stage">
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

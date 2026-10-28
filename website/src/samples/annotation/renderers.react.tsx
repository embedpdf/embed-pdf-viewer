import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  type AnnotationRenderer,
  type AnnotationRendererProps,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './renderers.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const proposal = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/proposal.pdf');
  return { kind: 'bytes', id: 'proposal', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A note drawn as your app's comment bubble, the author's initials in it and its
// text in the tooltip. It fills its frame, so the selection outline and the click
// area match it, and it turns with the annotation: a note stays upright on a turned
// page.
function CommentBubble({ annotation, hovered }: AnnotationRendererProps) {
  const initials = (annotation.author ?? '?')
    .split(' ')
    .map((word) => word[0])
    .join('');

  return (
    <div
      className={hovered ? 'bubble bubble--hover' : 'bubble'}
      title={annotation.contents ?? undefined}
    >
      {initials}
    </div>
  );
}

// Defined once, outside the component: the layer registers each entry.
const RENDERERS: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'text', component: CommentBubble },
];
const NONE: AnnotationRenderer[] = [];

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
      initialDocuments={[{ source: proposal }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Look">
            <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>
              Your look
            </button>
            <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>
              The PDF’s look
            </button>
          </div>
          <TurnButton />
        </div>
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer renderers={mine ? RENDERERS : NONE} />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

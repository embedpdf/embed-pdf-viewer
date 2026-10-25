import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { Anchored } from '@embedpdf/react/anchored';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotationAnchor,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './hover-card.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const proposal: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
      initialDocuments={[{ source: proposal }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <p className="hint">Point at a note or a marked sentence</p>
        <Stage className="stage" overlay={<HoverCard />}>
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

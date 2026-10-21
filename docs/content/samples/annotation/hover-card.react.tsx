import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { Anchored } from '@embedpdf/react/anchored';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotationAnchor,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './hover-card.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

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
      initialDocuments={[{ source: review }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
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

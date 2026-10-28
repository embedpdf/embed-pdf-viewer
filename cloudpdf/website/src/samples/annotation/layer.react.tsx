import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin, useAnnotationState } from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './layer.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const report: OpenInput = { kind: 'share', shareToken: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

function Status() {
  const { status, selected } = useAnnotationState();

  let text = 'Click an annotation to select it';
  if (status === 'loading') text = 'Loading the annotations…';
  else if (selected.length > 0) text = `Selected: ${selected.map((a) => a.subtype).join(', ')}`;

  return (
    <div className="toolbar">
      <p className="hint">{text}</p>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: report }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Status />
        <Stage className="stage">
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

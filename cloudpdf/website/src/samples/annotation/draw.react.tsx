import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { AnnotationLayer, annotationPlugin, useAnnotationList } from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './draw.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// The selection plugin lets the highlight tool mark the text you select.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'square', label: 'Rectangle' },
  { id: 'ink', label: 'Pen' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'note', label: 'Note' },
];

function Toolbar() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const count = useAnnotationList().length;

  // The rectangle tool is active on load: drag on the page to draw one.
  useEffect(() => {
    interaction.activateTool('square');
  }, [interaction]);

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Tool">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            aria-pressed={activeToolId === tool.id}
            onClick={() => interaction.activateTool(tool.id)}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <output className="readout">
        {count} {count === 1 ? 'annotation' : 'annotations'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Toolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

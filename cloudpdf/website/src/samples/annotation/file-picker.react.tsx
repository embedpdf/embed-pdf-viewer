import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useFilePickerProvider,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './file-picker.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const approvals: OpenInput = { kind: 'share', shareToken: 'shr_lu5Sb4r9PYjKrHS3qfNeUywM' };

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'stamp', label: 'Stamp' },
  { id: 'attachment', label: 'Attach a file' },
];

// The toolbar is always mounted, so it gives the stamp and attachment tools their file dialog.
function Toolbar() {
  useFilePickerProvider();
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  return (
    <div className="toolbar" role="toolbar">
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
      <p className="hint">
        {activeToolId === 'stamp' && 'Click the page, then pick a PNG or a JPEG'}
        {activeToolId === 'attachment' && 'Click the page, then pick any file'}
      </p>
    </div>
  );
}

// On load: the stamp tool is active.
function StartWithTheStamp() {
  const interaction = useInteraction();

  useEffect(() => {
    interaction.activateTool('stamp');
  }, [interaction]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: approvals }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <StartWithTheStamp />
        <Toolbar />
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

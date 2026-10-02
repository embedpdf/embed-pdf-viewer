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
import { cloudEngine } from '@cloudpdf/engine';

import './switch.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// The document opens with the hand tool.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin({ defaultTool: 'pan' }),
  selectionPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const LABELS: Record<string, string> = { pointer: 'Select', pan: 'Hand' };
const HINTS: Record<string, string> = {
  pointer: 'A drag selects text',
  pan: 'A drag scrolls the pages',
};

// A button for every tool you can switch to, the active one pressed.
function ToolSwitch() {
  const interaction = useInteraction();
  const { activeToolId, tools } = useInteractionState();

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Tool">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="segment"
            aria-pressed={tool.id === activeToolId}
            onClick={() => interaction.activateTool(tool.id)}
          >
            {LABELS[tool.id] ?? tool.id}
          </button>
        ))}
      </div>
      <output className="readout">{activeToolId ? HINTS[activeToolId] : ''}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ToolSwitch />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

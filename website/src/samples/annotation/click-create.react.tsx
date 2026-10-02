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
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './click-create.css';

const engine = localEngine();
// What one click makes: a 120 × 80 rectangle, an arrow pointing down at the click, and no circle.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({
    tools: [
      { id: 'square', clickCreate: { width: 120, height: 80 } },
      {
        id: 'arrow',
        extends: 'line',
        defaults: { lineEndings: { start: 'none', end: 'closed-arrow' } },
        clickCreate: { length: 80, rotation: 90, anchor: 'end' },
      },
      { id: 'circle', clickCreate: false }, // drag only
    ],
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const TOOLS = [
  { id: 'square', label: 'Rectangle', hint: 'A click makes 120 × 80 points' },
  { id: 'arrow', label: 'Arrow', hint: 'A click points an arrow down at it' },
  { id: 'circle', label: 'Circle', hint: 'Drag only: a click does nothing' },
];

function Toolbar() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const active = TOOLS.find((tool) => tool.id === activeToolId);

  // The rectangle tool is active on load: click the page.
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
      <p className="hint">{active?.hint ?? 'Pick a tool, then click the page'}</p>
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
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

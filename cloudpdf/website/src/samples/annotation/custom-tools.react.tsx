import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './custom-tools.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// A blue pen, an arrow, and three tools of your own. `meta` is yours: the toolbar reads its label.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({
    tools: [
      { id: 'ink', defaults: { color: '#1e90ff', strokeWidth: 3 }, meta: { label: 'Blue pen' } },
      {
        id: 'arrow',
        extends: 'line',
        defaults: { lineEndings: { start: 'none', end: 'closed-arrow' } },
        meta: { label: 'Arrow' },
      },
      {
        id: 'red-pen',
        extends: 'ink',
        defaults: { color: '#ff0000', strokeWidth: 2 },
        meta: { label: 'Red pen' },
      },
      {
        id: 'marker',
        extends: 'ink-highlight',
        defaults: { color: '#ffa500' },
        meta: { label: 'Marker' },
      },
      {
        id: 'todo',
        extends: 'note',
        defaults: { icon: 'key', contents: 'TODO' },
        meta: { label: 'To do' },
      },
    ],
  }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A toolbar that builds itself from the tools: every tool with a label gets a button.
function Toolbar() {
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);
  const labelled = annotation.tools.list().filter((tool) => typeof tool.meta?.label === 'string');

  // On load: an arrow drawn with the arrow tool's defaults, and the arrow tool active.
  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(
      cover,
      { subtype: 'line', linePoints: { start: { x: 520, y: 120 }, end: { x: 470, y: 230 } } },
      undefined,
      { tool: 'arrow' },
    );
    interaction.activateTool('arrow');
  }, [annotation, interaction, ready, cover]);

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Tool">
        <button
          type="button"
          aria-pressed={activeToolId === 'pointer'}
          onClick={() => interaction.activateTool('pointer')}
        >
          Select
        </button>
        {labelled.map((tool) => (
          <button
            key={tool.id}
            type="button"
            aria-pressed={activeToolId === tool.id}
            onClick={() => interaction.activateTool(tool.id)}
          >
            {String(tool.meta?.label)}
          </button>
        ))}
      </div>
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
              <RenderLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

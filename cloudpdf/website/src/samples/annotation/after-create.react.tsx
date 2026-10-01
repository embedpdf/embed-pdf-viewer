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
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationSettings,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './after-create.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function AfterDrawing() {
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const afterCreate = useAnnotationSettings((settings) => settings.afterCreate);

  // The rectangle tool is active on load.
  useEffect(() => {
    interaction.activateTool('square');
  }, [interaction]);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        aria-pressed={activeToolId === 'square'}
        onClick={() => interaction.activateTool('square')}
      >
        Rectangle
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={afterCreate.select}
          onChange={(event) =>
            annotation.updateSettings({ afterCreate: { select: event.target.checked } })
          }
        />
        Select it
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={afterCreate.tool === 'stay'}
          onChange={(event) =>
            annotation.updateSettings({
              afterCreate: { tool: event.target.checked ? 'stay' : 'default' },
            })
          }
        />
        Keep the tool
      </label>
      <button type="button" className="button" onClick={() => annotation.resetSettings()}>
        Reset
      </button>
      <span className="spacer" />
      <output className="readout">{activeToolId === 'square' ? 'Drawing' : 'Selecting'}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AfterDrawing />
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

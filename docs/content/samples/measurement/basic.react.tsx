import { useEffect, useRef } from 'react';
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
import { measurementPlugin, useMeasurement, usePageScale } from '@embedpdf/react/measurement';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  measurementPlugin(),
];

// [!doc-source sketch]
const sketch = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-sketch.pdf');
  return { kind: 'bytes', id: 'sketch', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'distance', label: 'Distance' },
  { id: 'perimeter', label: 'Perimeter' },
  { id: 'area', label: 'Area' },
];

function MeasureToolbar() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const measurement = useMeasurement();
  const scale = usePageScale(0); // the floor plan's scale
  const started = useRef(false);

  // On load: the floor plan at 1:100, the building's width measured, and the distance tool on.
  useEffect(() => {
    if (!scale.ready || started.current) return;
    started.current = true;
    void measurement
      .setPreset(0, 'metric-100')
      .then(() =>
        measurement.createMeasurement({
          kind: 'distance',
          page: 0,
          points: [
            { x: 62, y: 150 },
            { x: 550, y: 150 },
          ],
        }),
      )
      .then(() => interaction.activateTool('distance'));
  }, [measurement, interaction, scale.ready]);

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
      <span className="spacer" />
      <output className="badge">
        Scale {scale.measure?.subtype === 'rectilinear' ? scale.measure.ratio : '…'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: sketch }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MeasureToolbar />
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

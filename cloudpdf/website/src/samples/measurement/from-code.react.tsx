import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin, useAnnotationList } from '@embedpdf/react/annotation';
import { measurementPlugin, useMeasurement, usePageScale } from '@embedpdf/react/measurement';
import type { MeasurementKind } from '@embedpdf/react/measurement';
import { cloudEngine } from '@cloudpdf/engine';

import './from-code.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  measurementPlugin(),
];

const sketch: OpenInput = { kind: 'grant', grant: 'shr_IyOgSdO4AmJqV4BoMv5V0nYU' };

// Points on the floor plan, in page coordinates: two for a
// distance, the corners otherwise.
const SHAPES: Record<MeasurementKind, { x: number; y: number }[]> = {
  distance: [
    { x: 62, y: 723 },
    { x: 550, y: 723 },
  ],
  perimeter: [
    { x: 62, y: 613 },
    { x: 382, y: 613 },
    { x: 382, y: 723 },
  ],
  area: [
    { x: 382, y: 516 },
    { x: 550, y: 516 },
    { x: 550, y: 723 },
    { x: 382, y: 723 },
  ],
};

// The floor plan's lower half, where the measurements go.
const LOWER_HALF = { x: 50, y: 500, width: 512, height: 240 };

function MeasureButtons() {
  const measurement = useMeasurement();
  const stage = useStage();
  const scale = usePageScale(0);
  const count = useAnnotationList({ pages: [0] }).filter(
    (annotation) => 'intent' in annotation && !!annotation.intent?.endsWith('-dimension'),
  ).length;
  const started = useRef(false);

  // The same measurement the tool makes, with the page's scale and the tool's style.
  const measure = (kind: MeasurementKind) =>
    void measurement.createMeasurement({ kind, page: 0, points: SHAPES[kind] });

  // On load: an area, scrolled into view.
  useEffect(() => {
    if (!scale.ready || started.current) return;
    started.current = true;
    void measurement
      .createMeasurement({ kind: 'area', page: 0, points: SHAPES.area })
      .then(() => stage.reveal(0, { rect: LOWER_HALF }));
  }, [measurement, stage, scale.ready]);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!scale.ready}
        onClick={() => measure('distance')}
      >
        Distance
      </button>
      <button
        type="button"
        className="button"
        disabled={!scale.ready}
        onClick={() => measure('perimeter')}
      >
        Perimeter
      </button>
      <button
        type="button"
        className="button"
        disabled={!scale.ready}
        onClick={() => measure('area')}
      >
        Area
      </button>
      <span className="spacer" />
      <output className="readout">
        {count} {count === 1 ? 'measurement' : 'measurements'} on the plan
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: sketch }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MeasureButtons />
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

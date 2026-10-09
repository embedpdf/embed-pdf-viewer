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

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  measurementPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Points on the cover's empty lower half, in page coordinates: two for a
// distance, the corners otherwise.
const SHAPES: Record<MeasurementKind, { x: number; y: number }[]> = {
  distance: [
    { x: 60, y: 750 },
    { x: 550, y: 750 },
  ],
  perimeter: [
    { x: 70, y: 600 },
    { x: 150, y: 650 },
    { x: 250, y: 600 },
  ],
  area: [
    { x: 70, y: 670 },
    { x: 250, y: 670 },
    { x: 250, y: 730 },
    { x: 70, y: 730 },
  ],
};

// The cover's empty lower half, where the measurements go.
const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

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
        {count} {count === 1 ? 'measurement' : 'measurements'} on the cover
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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

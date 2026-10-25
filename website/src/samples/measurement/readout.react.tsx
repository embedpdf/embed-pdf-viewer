import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationKey,
  annotationPlugin,
  useAnnotation,
  useAnnotationList,
} from '@embedpdf/react/annotation';
import type { Annotation } from '@embedpdf/react/annotation';
import {
  measurementPlugin,
  useMeasurement,
  useMeasurementReadout,
  usePageScale,
} from '@embedpdf/react/measurement';
import { localEngine } from '@embedpdf/engine';

import './readout.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  measurementPlugin(),
];

const sketch = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-sketch.pdf');
  return { kind: 'bytes', id: 'sketch', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The floor plan's lower half, where the measurements go.
const LOWER_HALF = { x: 50, y: 500, width: 512, height: 240 };

// On load: the floor plan at 1:100, and one measurement of each kind on it, scrolled into view.
function MeasurePlan() {
  const measurement = useMeasurement();
  const stage = useStage();
  const ready = usePageScale(0).ready;
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void measurement.setPreset(0, 'metric-100').then(() =>
      Promise.all([
        measurement.createMeasurement({
          kind: 'distance',
          page: 0,
          points: [
            { x: 62, y: 723 },
            { x: 550, y: 723 },
          ],
        }),
        measurement.createMeasurement({
          kind: 'perimeter',
          page: 0,
          points: [
            { x: 62, y: 613 },
            { x: 382, y: 613 },
            { x: 382, y: 723 },
          ],
        }),
        measurement.createMeasurement({
          kind: 'area',
          page: 0,
          points: [
            { x: 382, y: 516 },
            { x: 550, y: 516 },
            { x: 550, y: 723 },
            { x: 382, y: 723 },
          ],
        }),
      ]).then(() => stage.reveal(0, { rect: LOWER_HALF })),
    );
  }, [measurement, stage, ready]);

  return null;
}

// A measurement is a line, polyline or polygon with a dimension intent.
const isMeasurement = (annotation: Annotation) =>
  'intent' in annotation && !!annotation.intent?.endsWith('-dimension');

function Readout({ annotation }: { annotation: Annotation }) {
  const readout = useMeasurementReadout(annotation.ref);
  const { selection } = useAnnotation();

  return (
    <li>
      <button type="button" className="row" onClick={() => selection.set([annotation.ref])}>
        <span className="kind">{'unavailable' in readout ? 'No scale' : readout.kind}</span>
        <span className="value">{'unavailable' in readout ? '—' : readout.label}</span>
      </button>
    </li>
  );
}

function Readouts() {
  const measurements = useAnnotationList({ pages: [0] }).filter(isMeasurement);

  return (
    <ul className="readouts" aria-label="Measurements on the plan">
      {measurements.map((annotation) => (
        <Readout key={annotationKey(annotation.ref)} annotation={annotation} />
      ))}
    </ul>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: sketch }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MeasurePlan />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <AnnotationLayer />
              </>
            )}
          </Stage>
          <Readouts />
        </div>
      </DocumentGate>
    </Viewer>
  );
}

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
import { cloudEngine } from '@cloudpdf/engine';

import './readout.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  measurementPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The cover's empty lower half, where the measurements go.
const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

// On load: the cover at 1:50, and one measurement of each kind on it, scrolled into view.
function MeasureCover() {
  const measurement = useMeasurement();
  const stage = useStage();
  const ready = usePageScale(0).ready;
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void measurement.setPreset(0, 'metric-50').then(() =>
      Promise.all([
        measurement.createMeasurement({
          kind: 'distance',
          page: 0,
          points: [
            { x: 60, y: 740 },
            { x: 550, y: 740 },
          ],
        }),
        measurement.createMeasurement({
          kind: 'perimeter',
          page: 0,
          points: [
            { x: 60, y: 580 },
            { x: 160, y: 640 },
            { x: 260, y: 590 },
          ],
        }),
        measurement.createMeasurement({
          kind: 'area',
          page: 0,
          points: [
            { x: 80, y: 650 },
            { x: 250, y: 650 },
            { x: 250, y: 710 },
            { x: 80, y: 710 },
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
    <ul className="readouts" aria-label="Measurements on the cover">
      {measurements.map((annotation) => (
        <Readout key={annotationKey(annotation.ref)} annotation={annotation} />
      ))}
    </ul>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MeasureCover />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer annotations={false} />
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

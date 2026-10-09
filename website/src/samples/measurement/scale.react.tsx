import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import {
  measurementPlugin,
  useMeasurement,
  useMeasurementState,
  usePageScale,
} from '@embedpdf/react/measurement';
import type { AreaUnit, LengthUnit } from '@embedpdf/react/measurement';
import { localEngine } from '@embedpdf/engine';

import './scale.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  measurementPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Precision is steps per unit: 100 shows two decimals.
const PRECISIONS = [1, 10, 100, 1000];

// The cover's empty lower half, where the measurements go.
const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

// On load: a distance and an area on the cover, at 1:100, scrolled into view.
function MeasureCover() {
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
            { x: 60, y: 740 },
            { x: 550, y: 740 },
          ],
        }),
        measurement.createMeasurement({
          kind: 'area',
          page: 0,
          points: [
            { x: 60, y: 580 },
            { x: 260, y: 580 },
            { x: 260, y: 700 },
            { x: 60, y: 700 },
          ],
        }),
      ]).then(() => stage.reveal(0, { rect: LOWER_HALF })),
    );
  }, [measurement, stage, ready]);

  return null;
}

function ScaleToolbar() {
  const measurement = useMeasurement();
  const { busy } = useMeasurementState();
  const scale = usePageScale(0);
  const [preset, setPreset] = useState('metric-100');
  const [unit, setUnit] = useState<LengthUnit>('m');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('m2');
  const [precision, setPrecision] = useState(100);

  // Every change recalculates the measurements already on the page.
  return (
    <div className="toolbar">
      <label className="label">
        Scale
        <select
          className="field"
          value={preset}
          disabled={busy}
          onChange={(event) => {
            setPreset(event.target.value);
            void measurement.setPreset(0, event.target.value);
          }}
        >
          {measurement.listPresets().map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Length
        <select
          className="field"
          value={unit}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value as LengthUnit;
            setUnit(next);
            void measurement.setUnit(0, next);
          }}
        >
          {measurement.listUnits().map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Area
        <select
          className="field"
          value={areaUnit}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value as AreaUnit;
            setAreaUnit(next);
            void measurement.setAreaUnit(0, next);
          }}
        >
          {measurement.listAreaUnits().map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Steps
        <select
          className="field"
          value={precision}
          disabled={busy}
          onChange={(event) => {
            const next = Number(event.target.value);
            setPrecision(next);
            void measurement.setPrecision(0, next);
          }}
        >
          {PRECISIONS.map((choice) => (
            <option key={choice} value={choice}>
              {choice === 1 ? 'Whole' : `1/${choice}`}
            </option>
          ))}
        </select>
      </label>
      <span className="spacer" />
      <output className="badge">
        {scale.measure?.subtype === 'rectilinear' ? scale.measure.ratio : '…'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MeasureCover />
        <ScaleToolbar />
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

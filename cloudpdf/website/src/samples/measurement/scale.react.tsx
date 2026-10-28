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
import { cloudEngine } from '@cloudpdf/engine';

import './scale.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  measurementPlugin(),
];

const sketch: OpenInput = { kind: 'share', shareToken: 'shr_IyOgSdO4AmJqV4BoMv5V0nYU' };

// Precision is steps per unit: 100 shows two decimals.
const PRECISIONS = [1, 10, 100, 1000];

// The floor plan's lower half, where the measurements go.
const LOWER_HALF = { x: 50, y: 500, width: 512, height: 240 };

// On load: a distance and an area on the floor plan, at 1:100, scrolled into view.
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: sketch }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MeasurePlan />
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

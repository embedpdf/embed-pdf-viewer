import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useInteraction } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import {
  measurementPlugin,
  useMeasurement,
  useMeasurementState,
  usePageScale,
} from '@embedpdf/react/measurement';
import type { LengthUnit } from '@embedpdf/react/measurement';
import { cloudEngine } from '@cloudpdf/engine';

import './calibrate.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  measurementPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function Calibration() {
  const measurement = useMeasurement();
  const interaction = useInteraction();
  const { calibrationRequest, busy } = useMeasurementState();
  const scale = usePageScale(0);
  const [length, setLength] = useState('20');
  const [unit, setUnit] = useState<LengthUnit>('cm');
  const started = useRef(false);

  // On load: calibrating, so the next line you drag is the known length.
  useEffect(() => {
    if (!scale.ready || started.current) return;
    started.current = true;
    if (measurement.canCalibrate()) measurement.startCalibration();
  }, [measurement, scale.ready]);

  // The plugin asks for the real length of the line you drew.
  if (calibrationRequest) {
    const value = Number(length);
    return (
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void measurement
            .calibrate({ ...calibrationRequest, distance: { value, unit } })
            .then(() => interaction.activateTool('distance'));
        }}
      >
        <span className="readout">That line is</span>
        <input
          className="field length"
          type="number"
          min="0"
          step="any"
          aria-label="Its real length"
          value={length}
          onChange={(event) => setLength(event.target.value)}
        />
        <select
          className="field"
          aria-label="Unit"
          value={unit}
          onChange={(event) => setUnit(event.target.value as LengthUnit)}
        >
          {measurement.listUnits().map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
        <button type="submit" className="button" disabled={busy || !(value > 0)}>
          Set the scale
        </button>
        <button type="button" className="button" onClick={() => measurement.dismissCalibration()}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!measurement.canCalibrate()}
        onClick={() => measurement.startCalibration()}
      >
        Calibrate
      </button>
      <output className="readout">
        Drag along something you know the length of, then measure with the new scale
      </output>
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
        <Calibration />
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

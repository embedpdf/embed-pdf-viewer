/**
 * The measurement controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here: every verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';

import type { MeasurementCapability, MeasurementConfig } from './contract';
import { createScaleReads } from './read/scale';
import { createServices, type MeasurementContext } from './services';
import { createViewportSync } from './sync/viewports';
import { createCalibration } from './write/calibration';
import { createMeasuring } from './write/create';
import { createScaleWrites } from './write/scale';

export function createMeasurementController(
  ctx: MeasurementContext,
  config: MeasurementConfig = {},
) {
  const services = createServices(ctx);
  const { events, store } = services;

  const viewports = createViewportSync(ctx, services, config);
  const reads = createScaleReads(ctx, services, config, viewports);
  const scale = createScaleWrites(ctx, services, config, reads, viewports);
  const calibration = createCalibration(ctx, services);
  const measuring = createMeasuring(services, viewports);

  const api: MeasurementCapability = composeApi('measurement', [
    reads.api,
    scale.api,
    calibration.api,
    measuring.api,
    {
      canCalibrate: store.canCalibrate,
      ensureLoaded: viewports.ensureLoaded,
      onScaleChanged: events.scaleChanged.on,
      onCalibrationRequested: events.calibrationRequested.on,
      onCalibrationCompleted: events.calibrationCompleted.on,
      onCalibrationDismissed: events.calibrationDismissed.on,
    },
  ]);

  return {
    api,
    connect() {
      calibration.connect();
      viewports.connect();
    },
  };
}

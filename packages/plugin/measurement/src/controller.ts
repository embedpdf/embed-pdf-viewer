/**
 * The measurement controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here: every verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';

import type { MeasurementCapability } from './contract';
import { createScaleReads } from './read/scale';
import { createServices, type MeasurementContext } from './services';
import { createViewportSync } from './sync/viewports';
import { createCalibration } from './write/calibration';
import { createMeasuring } from './write/create';
import { createScaleWrites } from './write/scale';

export function createMeasurementController(ctx: MeasurementContext) {
  const services = createServices(ctx);
  const { events, store } = services;
  const settings = ctx.settings();

  const viewports = createViewportSync(ctx, services);
  const reads = createScaleReads(ctx, services, viewports);
  const scale = createScaleWrites(ctx, services, viewports);
  const calibration = createCalibration(ctx, services);
  const measuring = createMeasuring(ctx, services, viewports);

  const api: MeasurementCapability = composeApi('measurement', [
    settings.api,
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

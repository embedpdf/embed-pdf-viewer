/**
 * The measurement controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here — every verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';
import type { MeasurementConfig } from './contract';
import type { MeasurementHostCapability } from './host-contract';
import { createScaleReads } from './read/scale';
import { createServices, type MeasurementContext } from './services';
import { createViewportSync } from './sync/viewports';
import { createCalibration } from './write/calibration';
import { createMeasuring } from './write/create';
import { createScaleWrites } from './write/scale';

export function createMeasurementController(
  ctx: MeasurementContext,
  config: MeasurementConfig = {},
): { api: MeasurementHostCapability; connect(): void } {
  const services = createServices(ctx);
  const { events, store } = services;

  const reads = createScaleReads(services, config);
  const viewports = createViewportSync(ctx, services, config);
  const scale = createScaleWrites(ctx, services, config, reads, viewports);
  const calibration = createCalibration(ctx, services);
  const measuring = createMeasuring(services);

  const api = composeApi('measurement', [
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
  ]) satisfies MeasurementHostCapability;

  return {
    api,
    connect() {
      calibration.connect();
      viewports.connect();
    },
  };
}

/** The capability alone, connected at once — the shape unit tests build. */
export function createMeasurementCapability(
  ctx: MeasurementContext,
  config: MeasurementConfig = {},
): MeasurementHostCapability {
  const { api, connect } = createMeasurementController(ctx, config);
  connect();
  return api;
}

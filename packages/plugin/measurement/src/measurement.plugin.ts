import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import { MeasurementToken, type MeasurementCapability, type MeasurementConfig } from './contract';
import { createMeasurementController } from './controller';
import { initialMeasurementState, type MeasurementState } from './model';

/**
 * Page scale, calibration and measurement readouts, document-scoped. The
 * annotation plugin owns the measurement annotations; this plugin owns the
 * page's viewports (the scale), keeps the annotation plugin's measure in step,
 * and turns the calibrate tool's drafts into scale requests.
 */
export const measurementPlugin = (config: MeasurementConfig = {}) =>
  definePlugin<MeasurementState, MeasurementCapability>({
    id: 'measurement',
    scope: 'document',
    token: MeasurementToken,
    requires: [AnnotationToken, InteractionToken],
    state: initialMeasurementState,
    create: (ctx) => createMeasurementController(ctx, config),
  });

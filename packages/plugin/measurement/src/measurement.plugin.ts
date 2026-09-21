import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import type { MeasurementConfig } from './contract';
import { createMeasurementController } from './controller';
import { MeasurementToken } from './host-contract';
import type { MeasurementHostCapability } from './host-contract';
import { initialMeasurementState, measurementReducer } from './model';
import type { MeasurementAction, MeasurementState } from './model';

/**
 * Page scale, calibration and measurement readouts — document-scoped. The
 * annotation plugin owns the measurement annotations; this plugin owns the
 * page's viewports (the scale), keeps the annotation plane's measure in step,
 * and turns the calibrate tool's drafts into scale requests.
 */
export const measurementPlugin = (config: MeasurementConfig = {}) =>
  definePlugin<MeasurementState, MeasurementAction, MeasurementHostCapability>({
    id: 'measurement',
    scope: 'document',
    token: MeasurementToken,
    requires: [AnnotationToken, InteractionToken],
    initialState: initialMeasurementState,
    reduce: measurementReducer,
    create: (ctx) => createMeasurementController(ctx, config),
  });

import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import { MEASUREMENT_DEFAULTS, MeasurementToken, type MeasurementConfig } from './contract';
import { createMeasurementController } from './controller';
import { initialMeasurementState } from './model';

/**
 * Page scale, calibration and measurement readouts, document-scoped. The
 * annotation plugin owns the measurement annotations; this plugin owns the
 * page's viewports (the scale), keeps the annotation plugin's measure in step,
 * and turns the calibrate tool's drafts into scale requests. `config` is the
 * settings the app registers, over {@link MEASUREMENT_DEFAULTS}.
 */
export const measurementPlugin = (config?: MeasurementConfig) =>
  definePlugin({
    id: 'measurement',
    scope: 'document',
    token: MeasurementToken,
    requires: [AnnotationToken, InteractionToken],
    state: initialMeasurementState,
    // A scale is one value: a change replaces it, never merges into it.
    settings: { defaults: MEASUREMENT_DEFAULTS, registered: config, whole: ['defaultScale'] },
    create: createMeasurementController,
  });

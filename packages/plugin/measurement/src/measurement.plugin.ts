import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import { createMeasurementCapability } from './capability';
import { createMeasurementEffects, type MeasurementEffects } from './effects';
import { initialMeasurementState, measurementReducer } from './reducer';
import { MeasurementToken } from './types';
import type {
  MeasurementAction,
  MeasurementCapability,
  MeasurementConfig,
  MeasurementState,
} from './types';

/**
 * Each document instance owns its driver. The driver is looked up by the
 * capability OBJECT (unique per instance), never by document id: a definition
 * is an immutable recipe two kernels may share, and two kernels can hold the
 * same document id at once.
 */
const driverOf = new WeakMap<object, MeasurementEffects>();

export const measurementPlugin = (config: MeasurementConfig = {}) =>
  definePlugin<MeasurementState, MeasurementAction, MeasurementCapability>({
    id: 'measurement',
    scope: 'document',
    token: MeasurementToken,
    requires: [AnnotationToken, InteractionToken],
    initialState: initialMeasurementState,
    reduce: measurementReducer,
    capability: (ctx) => {
      const effects = createMeasurementEffects(ctx, config);
      const capability = createMeasurementCapability(ctx, config, effects);
      driverOf.set(capability, effects);
      return capability;
    },
    effects: (ctx) => {
      // Capabilities are lazy; resolving our own token constructs this document's driver.
      driverOf.get(ctx.get(MeasurementToken))?.start();
    },
  });

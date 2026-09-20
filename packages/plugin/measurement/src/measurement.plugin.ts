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

export const measurementPlugin = (config: MeasurementConfig = {}) => {
  // A plugin definition is reused across documents. Drivers are keyed by the
  // bound instance, never one mutable closure shared between document tabs.
  const drivers = new Map<string, MeasurementEffects>();
  return definePlugin<MeasurementState, MeasurementAction, MeasurementCapability>({
    id: 'measurement',
    scope: 'document',
    token: MeasurementToken,
    requires: [AnnotationToken, InteractionToken],
    initialState: initialMeasurementState,
    reduce: measurementReducer,
    capability: (ctx) => {
      const effects = createMeasurementEffects(ctx, config);
      drivers.set(ctx.documentId!, effects);
      ctx.cleanup(() => {
        drivers.delete(ctx.documentId!);
      });
      return createMeasurementCapability(ctx, config, effects);
    },
    effects: (ctx) => {
      ctx.get(MeasurementToken); // Capabilities are lazy; construct this document's driver first.
      drivers.get(ctx.documentId!)!.start();
    },
  });
};

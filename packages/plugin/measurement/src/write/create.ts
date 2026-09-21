/** Measurement creation: a measurement annotation with the page's scale, through the annotation plugin. */
import { PluginError } from '@embedpdf/core';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';

import type { CreateMeasurementInput, MeasurementCapability } from '../contract';
import type { MeasurementServices } from '../services';

export function createMeasuring({
  store,
  siblings,
}: Pick<MeasurementServices, 'store' | 'siblings'>) {
  const { scaleOf } = store;
  const { annotation } = siblings;

  const createMeasurement = (input: CreateMeasurementInput): Promise<AnnotationRef> => {
    if (!annotation.canCreate()) {
      return Promise.reject(
        new PluginError(
          'permission-denied',
          'measurement',
          'measuring needs annotation create authority',
        ),
      );
    }
    if (!scaleOf(input.page).ready) {
      return Promise.reject(
        new PluginError('not-ready', 'measurement', 'the page scale is not known yet'),
      );
    }
    const tool = input.tool ?? input.kind;
    switch (input.kind) {
      case 'distance': {
        const [from, to] = input.points;
        if (!from || !to || input.points.length !== 2) {
          return Promise.reject(
            new PluginError('invalid-input', 'measurement', 'a distance needs exactly two points'),
          );
        }
        return annotation.create({ page: input.page, subtype: 'line', from, to, tool });
      }
      case 'perimeter':
        return annotation.create({
          page: input.page,
          subtype: 'polyline',
          vertices: input.points,
          tool,
        });
      case 'area':
        return annotation.create({
          page: input.page,
          subtype: 'polygon',
          vertices: input.points,
          tool,
        });
    }
  };

  return { api: { createMeasurement } satisfies Partial<MeasurementCapability> };
}

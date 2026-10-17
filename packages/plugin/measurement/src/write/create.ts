/** Measurement creation: a measurement annotation with the page's scale, through the annotation plugin. */
import { PluginError, type OperationOptions } from '@embedpdf/core';
import type { Annotation, AnnotationDraft, PageRef } from '@embedpdf/engine-core/runtime';

import type { CreateMeasurementInput, MeasurementCapability } from '../contract';
import type { MeasurementContext, MeasurementServices } from '../services';
import type { MeasurementViewportSync } from '../sync/viewports';

export function createMeasuring(
  ctx: Pick<MeasurementContext, 'assertAllowed' | 'pageOf'>,
  { siblings }: Pick<MeasurementServices, 'siblings'>,
  { scaleOf }: Pick<MeasurementViewportSync, 'scaleOf'>,
) {
  const { annotation } = siblings;

  /**
   * The measurement's engine draft: the tool's current defaults (style,
   * caption and leader), the dimension intent, and the page's scale. The
   * engine works out the label from the points and the scale.
   */
  const draftOf = (
    input: CreateMeasurementInput,
    page: PageRef,
    tool: string,
  ): AnnotationDraft | Error => {
    const style = annotation.tools.getDefaults(tool);
    const shared = {
      color: style.color,
      strokeWidth: style.strokeWidth,
      opacity: style.opacity,
      measure: scaleOf(page).measure,
      captionEnabled: style.captionEnabled ?? true,
    };
    switch (input.kind) {
      case 'distance': {
        const [from, to] = input.points;
        if (!from || !to || input.points.length !== 2) {
          return new PluginError(
            'invalid-input',
            'measurement',
            'a distance needs exactly two points',
          );
        }
        return {
          subtype: 'line',
          intent: 'line-dimension',
          linePoints: { start: from, end: to },
          lineEndings: style.lineEndings,
          // The arrowheads fill with the line's color unless the tool sets a fill.
          interiorColor: style.interiorColor ?? style.color,
          ...shared,
          captionPosition: style.captionPosition ?? 'inline',
          ...(style.leader ? { leader: style.leader } : {}),
        } as AnnotationDraft;
      }
      case 'perimeter':
        return {
          subtype: 'polyline',
          intent: 'polyline-dimension',
          vertices: input.points,
          lineEndings: style.lineEndings,
          ...shared,
        } as AnnotationDraft;
      case 'area':
        return {
          subtype: 'polygon',
          intent: 'polygon-dimension',
          vertices: input.points,
          interiorColor: style.interiorColor,
          ...shared,
        } as AnnotationDraft;
    }
  };

  const createMeasurement = async (
    input: CreateMeasurementInput,
    options?: OperationOptions,
  ): Promise<{ annotation: Annotation }> => {
    ctx.assertAllowed('annotations:create', 'measurement.createMeasurement');
    const page = ctx.pageOf(input.page).ref;
    if (!scaleOf(page).ready) {
      throw new PluginError('not-ready', 'measurement', 'the page scale is not known yet');
    }
    const draft = draftOf(input, page, input.tool ?? input.kind);
    if (draft instanceof Error) throw draft;
    return annotation.create(page, draft, undefined, { signal: options?.signal });
  };

  return { api: { createMeasurement } satisfies Partial<MeasurementCapability> };
}

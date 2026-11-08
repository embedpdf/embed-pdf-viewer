import { annotContentsEditable, annotTransformable } from '@embedpdf/core-annotation';
import {
  annotationKey,
  isDimension,
  isReadout,
  measurementReadout,
  serializeError,
  type AnnotationPatch,
  type PageMeasurementViewport,
  type PageRef,
  type PdfMeasure,
} from '@embedpdf/engine-core/runtime';

import type { RecalibrationReport } from '../host-contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { StoreChange } from '../services/store';

/**
 * The measurement seam: the per-page viewports (scale regions) the
 * measurement plugin supplies for dimension drafts, and recalibration of a
 * page's dimensions to a new scale.
 */
export function createMeasurement(
  ctx: Pick<AnnotationContext, 'cleanup'>,
  { store, records }: Pick<AnnotationServices, 'store' | 'records'>,
) {
  const pageViewports = new Map<
    number,
    {
      viewports: PageMeasurementViewport[] | undefined;
      fallback: PdfMeasure;
    }
  >();
  ctx.cleanup(() => {
    pageViewports.clear();
  });

  const api = {
    setPageViewports: (
      page: PageRef,
      viewports: PageMeasurementViewport[] | undefined,
      fallback: PdfMeasure,
    ) => {
      pageViewports.set(page.objectNumber, { viewports, fallback });
    },
    whenRemeasurable: async () => {
      if (records.getStatus() !== 'ready') {
        await records.refresh().catch(() => {});
      }
      await records.settled();
    },
    stageRemeasure: (page: PageRef, scale: PdfMeasure): RecalibrationReport => {
      const report: RecalibrationReport = { page, scale, updated: [], skipped: [], failed: [] };
      if (records.getStatus() !== 'ready') {
        report.error = serializeError(new Error('the annotations of this document are not loaded'));
        return report;
      }
      // The confirmed dimensions of the page, each with how this session sees
      // it (one the user just deleted is not in the view, and is left alone).
      const model = store.model();
      const candidates = Object.values(records.get().byKey).flatMap(({ dto }) => {
        const record = model.byId[annotationKey(dto.ref)];
        return record && dto.page.objectNumber === page.objectNumber && isDimension(dto)
          ? [{ dto, annotation: record }]
          : [];
      });
      const updates: StoreChange[] = [];
      for (const { dto, annotation } of candidates) {
        const ref = dto.ref;
        const reason =
          annotation.authority?.update === false
            ? 'no-authority'
            : !annotTransformable(annotation) || !annotContentsEditable(annotation)
              ? 'locked'
              : 'measure' in dto && dto.measure && dto.measure.subtype !== 'rectilinear'
                ? 'foreign-measure'
                : !isReadout(measurementReadout({ ...dto, measure: scale }))
                  ? 'unavailable'
                  : null;
        if (reason) {
          report.skipped.push({ ref, reason });
          continue;
        }
        updates.push({
          type: 'update',
          ref,
          patch: { subtype: dto.subtype, measure: scale } as AnnotationPatch,
        });
        report.updated.push(ref);
      }
      if (updates.length > 0) store.apply(updates);
      return report;
    },
  };

  return { viewportsOf: (pageObjectNumber: number) => pageViewports.get(pageObjectNumber), api };
}

export type Measurement = ReturnType<typeof createMeasurement>;

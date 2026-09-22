import { annotContentsEditable, annotTransformable } from '@embedpdf/core-annotation';
import {
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
import type { Mirror } from '@embedpdf/core';

import type { RecordIndex } from '../sync/records';
import type { Crud } from './crud';

/**
 * The measurement seam: the per-page viewports (scale regions) the
 * measurement plugin supplies for dimension drafts, and recalibration of a
 * page's dimensions to a new scale.
 */
export function createMeasurement(
  ctx: Pick<AnnotationContext, 'cleanup'>,
  { store }: Pick<AnnotationServices, 'store'>,
  crud: Pick<Crud, 'updateRaw'>,
  confirmedRecords: Mirror<RecordIndex>,
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
      pageViewports.set(page.pageObjectNumber, { viewports, fallback });
    },
    remeasurePage: async (page: PageRef, scale: PdfMeasure) => {
      const pageObjectNumber = page.pageObjectNumber;
      // Recalibration needs every dimension on the page: retry a failed load,
      // and wait for any load or page reload still running.
      if (confirmedRecords.getStatus() !== 'ready') {
        await confirmedRecords.refresh().catch(() => {});
      }
      await confirmedRecords.settled();
      const report: RecalibrationReport = { page, scale, updated: [], skipped: [], failed: [] };
      if (confirmedRecords.getStatus() !== 'ready') {
        report.error = serializeError(new Error('the annotations of this document are not loaded'));
        return report;
      }
      const candidates = Object.values(store.model().byId).filter(
        (annotation) =>
          annotation.page.pageObjectNumber === pageObjectNumber &&
          annotation.data &&
          isDimension(annotation.data),
      );
      for (const annotation of candidates) {
        const dto = annotation.data!,
          ref = dto.ref;
        const reason =
          annotation.authority?.update === false
            ? 'no-authority'
            : !annotTransformable(annotation) || !annotContentsEditable(annotation)
              ? 'locked'
              : 'measure' in dto && dto.measure && dto.measure.subtype !== 'RL'
                ? 'foreign-measure'
                : !isReadout(measurementReadout({ ...dto, measure: scale }))
                  ? 'unavailable'
                  : null;
        if (reason) {
          report.skipped.push({ ref, reason });
          continue;
        }
        try {
          await crud.updateRaw(ref, { subtype: dto.subtype, measure: scale } as AnnotationPatch);
          report.updated.push(ref);
        } catch (error) {
          report.failed.push({ ref, error: serializeError(error) });
        }
      }
      return report;
    },
  };

  return { viewportsOf: (pageObjectNumber: number) => pageViewports.get(pageObjectNumber), api };
}

export type Measurement = ReturnType<typeof createMeasurement>;

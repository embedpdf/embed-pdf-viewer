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
import type { Crud } from './crud';
import type { Hydration } from '../sync/hydration';

/**
 * The measurement seam: the per-page viewports (scale regions) the
 * measurement plugin supplies for dimension drafts, and recalibration of a
 * page's dimensions to a new scale.
 */
export function createMeasurement(
  ctx: Pick<AnnotationContext, 'cleanup' | 'getState'>,
  { store }: Pick<AnnotationServices, 'store'>,
  crud: Pick<Crud, 'updateRaw'>,
  hydration: Pick<Hydration, 'rehydrate'>,
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
      const pon = page.pageObjectNumber;
      await hydration.rehydrate();
      const report: RecalibrationReport = { page, scale, updated: [], skipped: [], failed: [] };
      const state = ctx.getState().hydration;
      if (state.status !== 'complete') {
        report.error = serializeError(
          state.status === 'error' ? state.error : new Error('Annotation hydration is incomplete'),
        );
        return report;
      }
      const candidates = Object.values(store.model().byId).filter(
        (a) => a.page.pageObjectNumber === pon && a.data && isDimension(a.data),
      );
      for (const a of candidates) {
        const dto = a.data!,
          ref = dto.ref;
        const reason =
          a.authority?.update === false
            ? 'no-authority'
            : !annotTransformable(a) || !annotContentsEditable(a)
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

  return { viewportsOf: (pon: number) => pageViewports.get(pon), api };
}

export type Measurement = ReturnType<typeof createMeasurement>;

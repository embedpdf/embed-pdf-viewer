import {
  assertWritableMeasure,
  EngineError,
  EngineErrorCode,
  normalizePdfRect,
  type PageObjectNumber,
  type PdfMeasure,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { withScratch } from '../../runtime/memory/scratch';
import { readUtf16String, writeUtf16String } from '../../runtime/memory/strings';
import { readRectF } from '../../runtime/memory/structs';
import { CALIBRATION_NAME } from './internal/readViewports';
import { requireMeasureWrite, writeMeasure } from './internal/measureCodec';

export class MeasureMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}
  setScale(pon: PageObjectNumber, measure: PdfMeasure | null, signal: AbortSignal): void {
    throwIfAborted(signal);
    if (measure !== null) {
      try {
        assertWritableMeasure(measure);
      } catch (e) {
        throw new EngineError(EngineErrorCode.InvalidArg, (e as Error).message);
      }
    }
    const { fn, mem } = this.runtime,
      pool = this.session.pagePool(),
      page = pool.acquire(pon);
    try {
      const owned: number[] = [];
      for (let i = 0; i < fn.EPDFPage_CountViewports(page); i++) {
        const vp = fn.EPDFPage_GetViewport(page, i);
        if (
          !vp ||
          readUtf16String(mem, (p, n) => fn.EPDFViewport_GetName(vp, p, n)) !== CALIBRATION_NAME
        )
          continue;
        const m = fn.EPDFViewport_GetMeasure(vp);
        if (!m || fn.EPDFMeasure_GetSubtype(m) === 1) owned.push(i);
      }
      const bbox = withScratch(mem, 16, (p) => {
        const index = this.session.recordByObjectNumber(pon).pageIndex;
        const doc = this.session.requireDocPtr();
        if (
          !fn.EPDF_GetPageBoxByIndex(doc, index, 1, p) &&
          !fn.EPDF_GetPageBoxByIndex(doc, index, 0, p)
        ) {
          throw new EngineError(EngineErrorCode.InvalidArg, 'Page has no valid calibration box');
        }
        return normalizePdfRect(readRectF(mem, p));
      });
      if (![bbox.left, bbox.right, bbox.bottom, bbox.top].every(Number.isFinite))
        throw new EngineError(EngineErrorCode.InvalidArg, 'Invalid calibration box');
      throwIfAborted(signal);
      // Apply boundary. Descending removals keep original indices valid; never rewrite /VP.
      if (measure === null) {
        for (const i of owned.reverse()) requireMeasureWrite(fn.EPDFPage_RemoveViewport(page, i));
        return;
      }
      withScratch(mem, 16, (p) => {
        mem.poke(p, 'f32', bbox.left);
        mem.poke(p, 'f32', bbox.top, 4);
        mem.poke(p, 'f32', bbox.right, 8);
        mem.poke(p, 'f32', bbox.bottom, 12);
        const vp = owned.length
          ? fn.EPDFPage_GetViewport(page, owned[owned.length - 1])
          : fn.EPDFPage_AddViewport(page, p);
        requireMeasureWrite(vp);
        requireMeasureWrite(fn.EPDFViewport_SetBBox(vp, p));
        requireMeasureWrite(
          writeUtf16String(mem, CALIBRATION_NAME, (name) => fn.EPDFViewport_SetName(vp, name)),
        );
        writeMeasure(fn, mem, fn.EPDFViewport_AddMeasure(vp), measure);
      });
    } finally {
      pool.release(pon);
    }
  }
}

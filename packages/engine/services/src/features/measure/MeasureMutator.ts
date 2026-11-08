import {
  assertWritableMeasure,
  CALIBRATION_VIEWPORT_NAME,
  EngineError,
  EngineErrorCode,
  type PageObjectNumber,
  type PdfMeasure,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { requireMeasureWrite, writeMeasure } from './internal/measureCodec';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { readUtf16String, writeUtf16String } from '../../runtime/memory/strings';
import { RECTF_BYTES } from '../../runtime/memory/structs';
import { throwIfAborted } from '../../shared/abort';
import { readBoxes } from '../pages/PagesReader';

export class MeasureMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}
  setScale(
    pageObjectNumber: PageObjectNumber,
    measure: PdfMeasure | null,
    signal: AbortSignal,
  ): void {
    throwIfAborted(signal);
    if (measure !== null) {
      try {
        assertWritableMeasure(measure);
      } catch (e) {
        throw new EngineError(EngineErrorCode.InvalidArg, (e as Error).message);
      }
    }
    const { fn, mem } = this.runtime;
    // Through the page dictionary (the fork's raw viewport functions): the page isn't loaded.
    const doc = this.session.requireDocPtr();
    const index = this.session.recordByObjectNumber(pageObjectNumber).pageIndex;
    const owned: number[] = [];
    for (let i = 0; i < fn.EPDFPage_CountViewportsRaw(doc, index); i++) {
      const vp = fn.EPDFPage_GetViewportRaw(doc, index, i);
      if (!vp) continue;
      try {
        if (
          readUtf16String(mem, (p, n) => fn.EPDFViewport_GetName(vp, p, n)) !==
          CALIBRATION_VIEWPORT_NAME
        )
          continue;
        const m = fn.EPDFViewport_GetMeasure(vp);
        if (!m || fn.EPDFMeasure_GetSubtype(m) === 1) owned.push(i);
      } finally {
        fn.EPDFViewport_Close(vp);
      }
    }
    // The calibration covers the visible page.
    const bbox = withScratch(mem, RECTF_BYTES, (p) => readBoxes(fn, mem, doc, index, p).crop);
    if (![bbox.left, bbox.right, bbox.bottom, bbox.top].every(Number.isFinite))
      throw new EngineError(EngineErrorCode.InvalidArg, 'Invalid calibration box');
    throwIfAborted(signal);
    // Apply boundary. Descending removals keep original indices valid; never rewrite /VP.
    if (measure === null) {
      for (const i of owned.reverse())
        requireMeasureWrite(fn.EPDFPage_RemoveViewportRaw(doc, index, i));
      return;
    }
    withScratch(mem, 16, (p) => {
      mem.poke(p, 'f32', bbox.left);
      mem.poke(p, 'f32', bbox.top, 4);
      mem.poke(p, 'f32', bbox.right, 8);
      mem.poke(p, 'f32', bbox.bottom, 12);
      const vp = owned.length
        ? fn.EPDFPage_GetViewportRaw(doc, index, owned[owned.length - 1])
        : fn.EPDFPage_AddViewportRaw(doc, index, p);
      requireMeasureWrite(vp);
      try {
        requireMeasureWrite(fn.EPDFViewport_SetBBox(vp, p));
        requireMeasureWrite(
          writeUtf16String(mem, CALIBRATION_VIEWPORT_NAME, (name) =>
            fn.EPDFViewport_SetName(vp, name),
          ),
        );
        writeMeasure(fn, mem, fn.EPDFViewport_AddMeasure(vp), measure);
      } finally {
        fn.EPDFViewport_Close(vp);
      }
    });
  }
}

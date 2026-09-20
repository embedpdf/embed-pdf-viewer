import type {
  LineDraft,
  LinePatch,
  PolygonDraft,
  PolygonPatch,
  PolylineDraft,
  PolylinePatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import {
  requireMeasureWrite,
  withMeasurePoint,
  writeMeasure,
} from '../../../measure/internal/measureCodec';

/** Receives normalized complete captions from the mutator, never partial state. */
export function writeMeasurementFields(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annot: Ptr,
  value: LineDraft | LinePatch | PolygonDraft | PolygonPatch | PolylineDraft | PolylinePatch,
): void {
  if (value.intent !== undefined) {
    if (value.intent === null) fn.EPDFAnnot_RemoveKey(annot, 'IT');
    else requireMeasureWrite(fn.EPDFAnnot_SetIntent(annot, value.intent));
  }
  if (value.measure !== undefined) {
    if (value.measure === null) requireMeasureWrite(fn.EPDFAnnot_RemoveMeasure(annot));
    else writeMeasure(fn, mem, fn.EPDFAnnot_AddMeasure(annot), value.measure);
  }
  if (value.subtype === 'line') {
    if (value.leader !== undefined) {
      requireMeasureWrite(
        fn.EPDFAnnot_SetLineLeader(
          annot,
          value.leader?.length ?? 0,
          value.leader?.extension ?? 0,
          value.leader?.offset ?? 0,
        ),
      );
    }
    if (value.caption !== undefined) {
      if (value.caption === null) {
        for (const key of ['Cap', 'CP', 'CO']) fn.EPDFAnnot_RemoveKey(annot, key);
      } else {
        const c = value.caption;
        requireMeasureWrite(
          withMeasurePoint(
            mem,
            c.offset ? { x: c.offset.along, y: c.offset.perpendicular } : undefined,
            (p) =>
              fn.EPDFAnnot_SetLineCaption(
                annot,
                c.enabled ?? false,
                c.position === 'top' ? 1 : 0,
                p,
              ),
          ),
        );
      }
    }
  } else if (value.caption !== undefined) {
    if (value.caption === null) {
      fn.EPDFAnnot_ClearEmbedMetadataKey(annot, 'MeasurementCaption');
      fn.EPDFAnnot_ClearEmbedMetadataKey(annot, 'MeasurementCaptionCenter');
    } else {
      const c = value.caption;
      requireMeasureWrite(
        withMeasurePoint(mem, c.center ?? undefined, (p) =>
          fn.EPDFAnnot_SetShapeCaption(annot, c.enabled ?? false, p),
        ),
      );
    }
  }
}

import type {
  PdfMeasure,
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
import { measurementIntentToName } from '../measurementIntent';

/** `EPDFMeasure_GetSubtype` of a rectilinear measure. */
const MEASURE_SUBTYPE_RL = 1;

/**
 * Receives the caption complete, as {@link prepareMeasurementDraft} and
 * {@link prepareMeasurementPatch} leave it: the native setters write the
 * whole caption at once. A foreign measure never reaches here.
 */
export function writeMeasurementFields(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annot: Ptr,
  value: LineDraft | LinePatch | PolygonDraft | PolygonPatch | PolylineDraft | PolylinePatch,
): void {
  if (value.intent !== undefined) {
    if (value.intent === null) fn.EPDFAnnot_RemoveKey(annot, 'IT');
    else requireMeasureWrite(fn.EPDFAnnot_SetIntent(annot, measurementIntentToName(value.intent)));
  }
  if (value.measure !== undefined) {
    if (value.measure === null) requireMeasureWrite(fn.EPDFAnnot_RemoveMeasure(annot));
    else {
      // A foreign measure is only ever replaced on purpose, and the native
      // setter never resets one in place, so it is removed first.
      const existing = fn.EPDFAnnot_GetMeasure(annot);
      if (existing && fn.EPDFMeasure_GetSubtype(existing) !== MEASURE_SUBTYPE_RL) {
        requireMeasureWrite(fn.EPDFAnnot_RemoveMeasure(annot));
      }
      writeMeasure(fn, mem, fn.EPDFAnnot_AddMeasure(annot), value.measure as PdfMeasure);
    }
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
    if (value.captionEnabled != null) {
      const offset = value.captionOffset ?? null;
      requireMeasureWrite(
        withMeasurePoint(
          mem,
          offset ? { x: offset.along, y: offset.perpendicular } : undefined,
          (p) =>
            fn.EPDFAnnot_SetLineCaption(
              annot,
              value.captionEnabled ?? false,
              value.captionPosition === 'top' ? 1 : 0,
              p,
            ),
        ),
      );
    }
  } else if (value.captionEnabled !== undefined) {
    if (value.captionEnabled === null) {
      fn.EPDFAnnot_ClearEmbedMetadataKey(annot, 'MeasurementCaption');
      fn.EPDFAnnot_ClearEmbedMetadataKey(annot, 'MeasurementCaptionCenter');
    } else {
      const enabled = value.captionEnabled;
      requireMeasureWrite(
        withMeasurePoint(
          mem,
          ('captionCenter' in value ? value.captionCenter : null) ?? undefined,
          (p) => fn.EPDFAnnot_SetShapeCaption(annot, enabled, p),
        ),
      );
    }
  }
}

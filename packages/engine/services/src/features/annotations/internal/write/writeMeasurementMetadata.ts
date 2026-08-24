import { measurementIntentFor, type MeasurementInfo } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { setIntent } from './annotationWritePrimitives';
import { EMBD_METADATA_SCHEMA_VERSION } from './writeEmbedMetadata';

/**
 * Persist a geometry annotation's measurement calibration.
 *
 * TWO things are written, and they say different things to different readers:
 *
 *   /EMBD_Metadata /Measurement (JSON string)   % the full calibration — OURS
 *   /IT /LineDimension | /PolyLineDimension |   % the spec intent — EVERYONE'S
 *       /PolygonDimension
 *
 * `/IT` is the ISO 32000-2 §12.5.6.9 marker: a foreign viewer that knows
 * nothing about EmbedPDF still sees "this line is a dimension" and will not
 * mistake it for decoration. It cannot carry the scale, though — that needs a
 * `/Measure` dictionary, which PDFium has no binding for — so the numbers ride
 * in the vendor dictionary we already own. The two are never authored
 * independently: the intent is DERIVED from the subtype and the mode
 * (`measurementIntentFor`), so a re-calibration that flips a polygon from area
 * to perimeter rewrites both together and they cannot drift apart.
 *
 * Tri-state, like every other patch field ("a patch touches what it states,
 * preserves what it omits"):
 *   - `undefined` → the keys are UNTOUCHED (a geometry-only patch on a
 *     measurement keeps its calibration).
 *   - `null` → DEMOTE: clear the calibration and the intent, so the annotation
 *     is once again an ordinary shape.
 *   - a value → SET both.
 *
 * Never clears the whole `/EMBD_Metadata` dict — the identity fields
 * (UserID/GroupID/CreatedBy/UpdatedBy) and the transform pair must survive.
 */
const KEY_MEASUREMENT = 'Measurement';

/** The subtypes that can carry a measurement — the five geometry kinds. */
export type MeasurableSubtype = 'line' | 'polyline' | 'polygon' | 'circle' | 'square';

/** Seed `/SchemaVersion` when this write is what creates the dict. */
function ensureSchemaVersion(fn: PdfFunctions, annotPtr: Ptr): void {
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) {
    fn.EPDFAnnot_SetEmbedMetadataNumber(annotPtr, 'SchemaVersion', EMBD_METADATA_SCHEMA_VERSION);
  }
}

export function writeMeasurementMetadata(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  subtype: MeasurableSubtype,
  measurement: MeasurementInfo | null | undefined,
): void {
  if (measurement === undefined) return;

  if (measurement === null) {
    fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_MEASUREMENT);
    // Clearing `/IT` is an empty name: the annotation stops declaring itself a
    // dimension, which is exactly what demoting it means.
    setIntent(fn, annotPtr, '');
    return;
  }

  ensureSchemaVersion(fn, annotPtr);
  const ptr = mem.writeU16String(JSON.stringify(measurement));
  try {
    fn.EPDFAnnot_SetEmbedMetadataString(annotPtr, KEY_MEASUREMENT, ptr);
  } finally {
    mem.free(ptr);
  }
  setIntent(fn, annotPtr, measurementIntentFor(subtype, measurement.mode));
}

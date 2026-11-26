import { EngineError, EngineErrorCode, type StampFit } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readEmbedMetadataString } from './read/readEmbedMetadata';
import { EMBD_METADATA_SCHEMA_VERSION, writeEmbedMetadataString } from './write/writeEmbedMetadata';

/**
 * `/EMBD_Metadata/AppearanceFit`: how a stamp's drawing fills its box, so a
 * new box fits it the same way. A mark in a signature field's widget records
 * none: it is always fitted with `contain`, and a widget keeps nothing of
 * ours (an older version wrote one beside a mark; nothing reads it).
 */
export const KEY_APPEARANCE_FIT = 'AppearanceFit';

/** `EPDF_STAMP_FIT` codes from `public/fpdf_annot.h` (CSS `object-fit` naming on the wire). */
export const APPEARANCE_FIT_CODE: Record<StampFit, number> = {
  contain: 0, // EPDF_STAMP_FIT_CONTAIN
  cover: 1, // EPDF_STAMP_FIT_COVER
  fill: 2, // EPDF_STAMP_FIT_STRETCH
};

const FITS: readonly string[] = Object.keys(APPEARANCE_FIT_CODE);

/** The fit an annotation records, or `null` when it records none (or one we don't know). */
export function readAppearanceFit(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): StampFit | null {
  const value = readEmbedMetadataString(fn, mem, annotPtr, KEY_APPEARANCE_FIT);
  return value !== undefined && FITS.includes(value) ? (value as StampFit) : null;
}

/** Record how the drawing fills the box; `null` removes the record. */
export function writeAppearanceFit(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  fit: StampFit | null,
): void {
  if (fit === null) {
    fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_APPEARANCE_FIT);
    return;
  }
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) {
    fn.EPDFAnnot_SetEmbedMetadataNumber(annotPtr, 'SchemaVersion', EMBD_METADATA_SCHEMA_VERSION);
  }
  writeEmbedMetadataString(fn, mem, annotPtr, KEY_APPEARANCE_FIT, fit);
}

/**
 * Fit the drawing an annotation holds into its box again, as the box now
 * stands and turns: a stamp's box and turn are the ones our keys record, a
 * widget's the ones `/Rect` and `/MK /R` give.
 */
export function refitAppearance(fn: PdfFunctions, annotPtr: Ptr, fit: StampFit): void {
  if (!fn.EPDFAnnot_UpdateAppearanceToRect(annotPtr, APPEARANCE_FIT_CODE[fit])) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'EPDFAnnot_UpdateAppearanceToRect returned false',
    );
  }
}

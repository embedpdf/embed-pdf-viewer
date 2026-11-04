import type { StampFit } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readEmbedMetadataString } from './read/readEmbedMetadata';
import { EMBD_METADATA_SCHEMA_VERSION, writeEmbedMetadataString } from './write/writeEmbedMetadata';

/**
 * `/EMBD_Metadata/AppearanceFit`: how a drawing placed in an annotation fills
 * its box. A stamp's drawing records it, and so does a mark drawn into a
 * signature field's widget.
 */
export const KEY_APPEARANCE_FIT = 'AppearanceFit';

const FITS: readonly string[] = ['contain', 'cover', 'fill'];

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

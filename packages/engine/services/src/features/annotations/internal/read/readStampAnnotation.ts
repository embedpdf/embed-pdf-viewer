import type { AnnotationBase, StampAnnotationDTO, StampFit } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotName } from './annotationReadPrimitives';
import {
  readAnnotationRotation,
  readAnnotationUnrotatedRect,
} from './readAnnotationTransformMetadata';
import { readEmbedMetadataString } from './readEmbedMetadata';

/** `/EMBD_Metadata/AppearanceFit`: how a stamp's drawing fills its box. */
export const KEY_APPEARANCE_FIT = 'AppearanceFit';

const STAMP_FITS: readonly string[] = ['contain', 'cover', 'fill'];

/** The fit a stamp records, or `null` when it records none (or one we don't know). */
export function readStampFit(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): StampFit | null {
  const value = readEmbedMetadataString(fn, mem, annotPtr, KEY_APPEARANCE_FIT);
  return value !== undefined && STAMP_FITS.includes(value) ? (value as StampFit) : null;
}

/**
 * Stamp DTO: base + `/Name` (standard or custom identifier, verbatim) +
 * transform metadata + the recorded fit. The visual content
 * stays in the `/AP` stream — rendered via `renderAppearanceImages()`,
 * never surfaced as DTO data.
 */
export function readStamp(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): StampAnnotationDTO {
  const rotation = readAnnotationRotation(fn, mem, annotPtr);
  const unrotatedRect = readAnnotationUnrotatedRect(fn, mem, annotPtr);
  return {
    ...base,
    subtype: 'stamp',
    name: readAnnotName(fn, mem, annotPtr),
    fit: readStampFit(fn, mem, annotPtr),
    rotation: rotation ?? null,
    unrotatedRect: unrotatedRect ?? null,
  };
}

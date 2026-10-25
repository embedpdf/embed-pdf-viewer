import {
  documentFontNameOf,
  familyKey,
  fontNameForFace,
  isStandardFontName,
  type FontName,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readDefaultAppearanceFace } from './annotationReadPrimitives';
import { readUtf8String } from '../../../../runtime/memory/strings';

/**
 * The `fontFamily` that names a box's font face, as `doc.fonts.list()` names
 * it: one of the engine's fonts by its key; a standard font's name; a
 * document font by its PostScript name (the font `/DA` names, when that is
 * this face); else the family with its style (`'Inter,Medium'`).
 */
export function boxFontName(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  face: { family: string; weight: number; italic: boolean },
  fonts?: { keyForFace(family: string, weight: number, italic: boolean): string | undefined },
): FontName {
  const key = fonts?.keyForFace(face.family, face.weight, face.italic);
  if (key !== undefined) return key;
  const named = fontNameForFace(face);
  if (isStandardFontName(named)) return named;
  const drawn = readDefaultAppearanceFace(fn, mem, annotPtr);
  if (
    drawn &&
    familyKey(drawn.family) === familyKey(face.family) &&
    drawn.weight === face.weight &&
    drawn.italic === face.italic
  ) {
    const postScriptName = readUtf8String(mem, (buf, capacity) =>
      fn.EPDFAnnot_GetDefaultAppearanceFontPostScriptName(annotPtr, buf, capacity),
    );
    if (postScriptName) return postScriptName;
  }
  return documentFontNameOf({
    familyName: face.family,
    weight: face.weight,
    italic: face.italic,
    programs: [],
  });
}

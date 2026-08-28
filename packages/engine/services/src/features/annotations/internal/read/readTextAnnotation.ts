import type {
  AnnotationBase,
  Color,
  NoteIcon,
  TextAnnotationDTO,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { NOTE_CODE_TO_ICON } from '../annotationIcon';
import { stateFromPdf, stateModelFromPdf } from '../annotationState';
import { readAnnotColor, readAnnotOpacity, readAnnotString } from './annotationReadPrimitives';

/** Default `/C` — matches the generator's yellow note fill and the writer default. */
const DEFAULT_NOTE_COLOR: Color = { r: 255, g: 255, b: 0 };

/** An absent or foreign `/Name` reads as 'note' (ISO 32000 §12.5.6.4 default). */
const DEFAULT_NOTE_ICON: NoteIcon = 'note';

export function readText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): TextAnnotationDTO {
  const color = readAnnotColor(fn, mem, annotPtr) ?? { ...DEFAULT_NOTE_COLOR };
  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));
  const icon = NOTE_CODE_TO_ICON[fn.EPDFAnnot_GetName(annotPtr)] ?? DEFAULT_NOTE_ICON;
  // /State + /StateModel (ISO 32000 §12.5.6.3): faithful read — `null` iff
  // the key is absent. Known Table 174 spellings normalize to the lowercase
  // wire vocabulary; custom state models pass through verbatim. ISO
  // defaulting (a model with no explicit state) is a composer concern.
  const stateRaw = readAnnotString(fn, mem, annotPtr, 'State');
  const stateModelRaw = readAnnotString(fn, mem, annotPtr, 'StateModel');

  return {
    ...base,
    subtype: 'text',
    icon,
    color,
    opacity,
    state: stateRaw === null ? null : stateFromPdf(stateRaw),
    stateModel: stateModelRaw === null ? null : stateModelFromPdf(stateModelRaw),
  };
}

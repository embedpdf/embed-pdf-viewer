import type {
  AnnotationBase,
  Color,
  NoteIcon,
  TextAnnotationDTO,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { NOTE_CODE_TO_ICON } from '../annotationIcon';
import { readAnnotColor, readAnnotOpacity } from './annotationReadPrimitives';

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

  return {
    ...base,
    subtype: 'text',
    icon,
    color,
    opacity,
  };
}

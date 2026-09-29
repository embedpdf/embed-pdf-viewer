import type {
  AnnotationBase,
  CaretAnnotationDTO,
  Color,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotColor, readAnnotOpacity, readIntent } from './annotationReadPrimitives';
import { readAnnotationBox } from './readAnnotationTurn';
import { caretIntentFromName } from '../textEditIntent';

/** Default `/C` colour when a caret has none (matches the writer default). */
const DEFAULT_CARET_COLOR: Color = '#ff0000';

export function readCaret(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): CaretAnnotationDTO<PdfCoordinates> {
  const color = readAnnotColor(fn, mem, annotPtr) ?? DEFAULT_CARET_COLOR;
  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));
  const intent = caretIntentFromName(readIntent(fn, mem, annotPtr));

  return {
    ...base,
    subtype: 'caret',
    intent,
    color,
    opacity,
    ...readAnnotationBox(fn, mem, annotPtr),
  };
}

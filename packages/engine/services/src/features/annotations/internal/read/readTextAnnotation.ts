import type {
  AnnotationBase,
  Color,
  NoteIcon,
  TextAnnotationDTO,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { NOTE_NAME_TO_ICON } from '../annotationIcon';
import { stateFromPdf, stateModelFromPdf } from '../annotationState';
import {
  readAnnotBoolean,
  readAnnotColor,
  readAnnotOpacity,
  readAnnotString,
  readAnnotName,
} from './annotationReadPrimitives';

/** Default `/C` — matches the generator's yellow note fill and the writer default. */
const DEFAULT_NOTE_COLOR: Color = '#ffff00';

/** An absent or foreign `/Name` reads as 'note' (ISO 32000 §12.5.6.4 default). */
const DEFAULT_NOTE_ICON: NoteIcon = 'note';

export function readText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): TextAnnotationDTO<PdfCoordinates> {
  const color = readAnnotColor(fn, mem, annotPtr) ?? DEFAULT_NOTE_COLOR;
  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));
  const icon = NOTE_NAME_TO_ICON[readAnnotName(fn, mem, annotPtr) ?? ''] ?? DEFAULT_NOTE_ICON;
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
    open: readAnnotBoolean(fn, mem, annotPtr, 'Open') ?? readPopupOpen(fn, mem, annotPtr) ?? false,
    color,
    opacity,
    state: stateRaw === null ? null : stateFromPdf(stateRaw),
    stateModel: stateModelRaw === null ? null : stateModelFromPdf(stateModelRaw),
  };
}

/** The note's popup's `/Open`, which a note without its own `/Open` shows. */
function readPopupOpen(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): boolean | null {
  const popupPtr = fn.FPDFAnnot_GetLinkedAnnot(annotPtr, 'Popup');
  if (!popupPtr) return null;
  try {
    return readAnnotBoolean(fn, mem, popupPtr, 'Open');
  } finally {
    fn.FPDFPage_CloseAnnot(popupPtr);
  }
}

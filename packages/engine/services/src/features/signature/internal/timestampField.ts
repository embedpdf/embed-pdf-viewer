import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import {
  setAnnotFlags,
  setAnnotRect,
} from '../../annotations/internal/write/annotationWritePrimitives';

/** EPDF_FORMFIELD_FAMILY_SIGNATURE in public/epdf_form.h. */
const SIGNATURE_FAMILY = 7;
/** FPDF_ANNOT_WIDGET. */
const WIDGET_SUBTYPE = 20;
/** How many names are tried before giving up: `Timestamp1` to `Timestamp64`. */
const MAX_NAMES = 64;

/**
 * Make the field a document timestamp goes in, on `docPtr`: a signature field with a name no
 * other field has, and one widget of no size on the first page, set to print and locked.
 * That is how Acrobat and pyHanko make the field of a document timestamp: it shows nowhere
 * and nothing can move it.
 *
 * It is written straight to the document it is given, which is a signing candidate: the live
 * document gets the field when the signing completes, in the same revision as the timestamp.
 */
export function createTimestampField(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
): { fieldObjectNumber: number; name: string } {
  const { fn, mem } = runtime;
  for (let attempt = 1; attempt <= MAX_NAMES; attempt++) {
    const name = `Timestamp${attempt}`;
    const namePtr = mem.writeU16String(name);
    let fieldObjectNumber: number;
    try {
      // 0: the next free object number. A name another field has is refused.
      fieldObjectNumber = fn.EPDFForm_CreateField(docPtr, SIGNATURE_FAMILY, namePtr, 0);
    } finally {
      mem.free(namePtr);
    }
    if (fieldObjectNumber <= 0) continue;

    const annotPtr = fn.EPDFPage_CreateAnnotRaw(docPtr, 0, WIDGET_SUBTYPE, 0);
    if (annotPtr === NULL_PTR) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        'the document has no first page to put the timestamp field on',
      );
    }
    let widgetObjectNumber: number;
    try {
      setAnnotRect(fn, mem, annotPtr, { left: 0, top: 0, right: 0, bottom: 0 });
      setAnnotFlags(fn, annotPtr, { print: true, locked: true });
      widgetObjectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
    if (
      widgetObjectNumber <= 0 ||
      !fn.EPDFForm_AttachWidget(docPtr, fieldObjectNumber, widgetObjectNumber, '', 0)
    ) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'the timestamp field could not be given its widget',
      );
    }
    removeAppearance(runtime, docPtr, widgetObjectNumber);
    return { fieldObjectNumber, name };
  }
  throw new EngineError(
    EngineErrorCode.SignatureRefused,
    `the engine could not make a field for the timestamp: no name from Timestamp1 to Timestamp${MAX_NAMES} could be used`,
  );
}

/** FPDF_ANNOT_APPEARANCEMODE_NORMAL. */
const NORMAL_APPEARANCE = 0;

/**
 * Take away the appearance a widget was given when its field adopted it. A widget of no size
 * draws nothing, and Acrobat and pyHanko give the widget of a document timestamp none.
 */
function removeAppearance(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  widgetObjectNumber: number,
): void {
  const { fn } = runtime;
  const index = fn.EPDFPage_GetAnnotIndexByObjectNumberRaw(docPtr, 0, widgetObjectNumber);
  const annotPtr = index < 0 ? NULL_PTR : fn.EPDFPage_GetAnnotRaw(docPtr, 0, index);
  if (annotPtr === NULL_PTR) {
    throw new EngineError(EngineErrorCode.Unknown, 'the timestamp widget is not on its page');
  }
  try {
    if (!fn.FPDFAnnot_SetAP(annotPtr, NORMAL_APPEARANCE, NULL_PTR)) {
      throw new EngineError(EngineErrorCode.Unknown, 'the timestamp widget kept its appearance');
    }
  } finally {
    fn.FPDFPage_CloseAnnot(annotPtr);
  }
}

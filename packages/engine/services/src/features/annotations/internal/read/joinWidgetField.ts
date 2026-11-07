import type { Annotation, PdfCoordinates } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';
// Cross-feature read into the forms model cache: the widget<->field join is
// form-tree knowledge, and the version-keyed cache makes it O(1) between
// mutations. No module cycle: the cache imports nothing from annotations.
import { acquireFormModel } from '../../../forms/internal/formModelCache';
import { FAMILY_BY_CODE } from '../../../forms/internal/readFormSnapshot';
import { checkStyleOfCaption } from '../../../forms/internal/widgetCaption';

/** `EPDFForm_GetFieldValueKind`: the field has no `/V`. */
const VALUE_KIND_NONE = 0;

/**
 * Resolve the owning field's object number for a widget annotation, or 0
 * when unattached. (The /Parent of a widget is a field dictionary - not an
 * annotation - so FPDFAnnot_GetLinkedAnnot cannot follow it; the reconciled
 * form model is the authoritative join.)
 */
export function resolveWidgetFieldObjectNumber(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  annotObjectNumber: number,
): number {
  if (annotObjectNumber <= 0) return 0;
  const model = acquireFormModel(runtime, session);
  const fieldIndex = runtime.fn.EPDFForm_GetFieldIndexForWidget(model, annotObjectNumber);
  if (fieldIndex < 0) return 0;
  return runtime.fn.EPDFForm_GetFieldObjNum(model, fieldIndex);
}

/**
 * Stamp the field ref and family onto every widget DTO in a freshly read
 * list. `/MK /CA` is a push button's caption, and a checkbox's or radio
 * button's symbol (`checkStyle`); another widget's reads as neither. A
 * signature field's widget has a mark in it when the field is signed (it
 * has a value) or a mark was drawn into it (the read found its fit); no
 * other widget has one.
 */
export function joinWidgetFieldNumbers(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  annotations: Annotation<PdfCoordinates>[],
): void {
  for (const annotation of annotations) {
    if (annotation.subtype !== 'widget') continue;
    if (annotation.ref.kind !== 'objectNumber') {
      annotation.caption = null;
      annotation.hasMark = false;
      continue;
    }
    const model = acquireFormModel(runtime, session);
    const fieldIndex = runtime.fn.EPDFForm_GetFieldIndexForWidget(
      model,
      annotation.ref.objectNumber,
    );
    const fieldObjectNumber =
      fieldIndex < 0 ? 0 : runtime.fn.EPDFForm_GetFieldObjNum(model, fieldIndex);
    if (fieldObjectNumber <= 0) {
      // In no field, or in one stored inline, which no ref can address.
      annotation.field = null;
      annotation.fieldKind = 'unknown';
      annotation.caption = null;
      annotation.hasMark = false;
      continue;
    }
    annotation.field = { kind: 'objectNumber', objectNumber: fieldObjectNumber };
    annotation.fieldKind =
      FAMILY_BY_CODE[runtime.fn.EPDFForm_GetFieldFamily(model, fieldIndex)] ?? 'unknown';
    if (annotation.fieldKind === 'checkbox' || annotation.fieldKind === 'radio') {
      annotation.checkStyle = checkStyleOfCaption(annotation.caption ?? null);
    }
    if (annotation.fieldKind !== 'pushbutton') annotation.caption = null;
    annotation.hasMark =
      annotation.fieldKind === 'signature' &&
      (annotation.hasMark ||
        runtime.fn.EPDFForm_GetFieldValueKind(model, fieldIndex) !== VALUE_KIND_NONE);
  }
}

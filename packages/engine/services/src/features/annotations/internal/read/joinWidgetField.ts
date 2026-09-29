import type { AnnotationDTO, PdfCoordinates } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';
// Cross-feature read into the forms model cache: the widget<->field join is
// form-tree knowledge, and the version-keyed cache makes it O(1) between
// mutations. No module cycle: the cache imports nothing from annotations.
import { acquireFormModel } from '../../../forms/internal/formModelCache';
import { FAMILY_BY_CODE } from '../../../forms/internal/readFormSnapshot';

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

/** Stamp the field ref and family onto every widget DTO in a freshly read list. */
export function joinWidgetFieldNumbers(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  annotations: AnnotationDTO<PdfCoordinates>[],
): void {
  for (const annotation of annotations) {
    if (annotation.subtype !== 'widget') continue;
    if (annotation.ref.kind !== 'objectNumber') continue;
    const model = acquireFormModel(runtime, session);
    const fieldIndex = runtime.fn.EPDFForm_GetFieldIndexForWidget(
      model,
      annotation.ref.annotObjectNumber,
    );
    const fieldObjectNumber =
      fieldIndex < 0 ? 0 : runtime.fn.EPDFForm_GetFieldObjNum(model, fieldIndex);
    if (fieldObjectNumber <= 0) {
      // In no field, or in one stored inline, which no ref can address.
      annotation.field = null;
      annotation.fieldFamily = 'unknown';
      continue;
    }
    annotation.field = { kind: 'objectNumber', fieldObjectNumber };
    annotation.fieldFamily =
      FAMILY_BY_CODE[runtime.fn.EPDFForm_GetFieldFamily(model, fieldIndex)] ?? 'unknown';
  }
}

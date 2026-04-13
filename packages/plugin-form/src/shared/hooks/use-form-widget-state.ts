import { useCallback, useEffect, useMemo, useState } from '@framework';
import { PDF_FORM_FIELD_FLAG, PdfWidgetAnnoField, PdfWidgetAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '@embedpdf/plugin-annotation/@framework';
import { useFormCapability } from './use-form';

export function useFormWidgetState(props: AnnotationRendererProps<PdfWidgetAnnoObject>) {
  const { currentObject: annotation, scale, pageIndex } = props;
  const field = annotation.field;
  const { provides: formProvides } = useFormCapability();
  const [renderKey, setRenderKey] = useState(0);

  const isReadOnly = !!(field.flag & PDF_FORM_FIELD_FLAG.READONLY);

  const scope = useMemo(
    () => formProvides?.forDocument(props.documentId),
    [formProvides, props.documentId],
  );

  useEffect(() => {
    if (!scope) return;
    return scope.onFieldValueChange((event) => {
      if (event.annotationId === annotation.id) {
        setRenderKey((k) => k + 1);
      }
    });
  }, [scope, annotation.id]);

  const handleChangeField = useCallback(
    (newField: PdfWidgetAnnoField) => {
      if (!scope) return;
      scope.setFormFieldValues(pageIndex, annotation, newField);
    },
    [scope, pageIndex, annotation],
  );

  return { annotation, field, scale, pageIndex, scope, handleChangeField, renderKey, isReadOnly };
}

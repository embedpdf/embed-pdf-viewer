import { ref, computed, watchEffect } from 'vue';
import { PDF_FORM_FIELD_FLAG, PdfWidgetAnnoField, PdfWidgetAnnoObject } from '@embedpdf/models';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import { useFormCapability } from './use-form';

export function useFormWidgetState(props: AnnotationRendererProps<PdfWidgetAnnoObject>) {
  const { provides: formProvides } = useFormCapability();
  const renderKey = ref(0);

  const scope = computed(() => formProvides.value?.forDocument(props.documentId) ?? null);
  const annotation = computed(() => props.currentObject);
  const field = computed(() => annotation.value.field);
  const scale = computed(() => props.scale);
  const pageIndex = computed(() => props.pageIndex);
  const isReadOnly = computed(() => !!(field.value.flag & PDF_FORM_FIELD_FLAG.READONLY));

  watchEffect((onCleanup) => {
    const s = scope.value;
    if (!s) return;
    const id = annotation.value.id;
    const unsubscribe = s.onFieldValueChange((event) => {
      if (event.annotationId === id) {
        renderKey.value++;
      }
    });
    onCleanup(unsubscribe);
  });

  function handleChangeField(newField: PdfWidgetAnnoField) {
    const s = scope.value;
    if (!s) return;
    s.setFormFieldValues(pageIndex.value, annotation.value, newField);
  }

  return {
    annotation,
    field,
    scale,
    pageIndex,
    scope,
    handleChangeField,
    renderKey,
    isReadOnly,
  };
}

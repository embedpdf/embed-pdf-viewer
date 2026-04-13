import { PDF_FORM_FIELD_FLAG, PdfWidgetAnnoField, PdfWidgetAnnoObject } from '@embedpdf/models';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
import { deepToRaw } from '@embedpdf/utils/svelte';
import { useFormCapability } from './use-form.svelte';

export function useFormWidgetState(props: AnnotationRendererProps<PdfWidgetAnnoObject>) {
  const formCapability = useFormCapability();
  let renderKey = $state(0);

  const scope = $derived(formCapability.provides?.forDocument(props.documentId) ?? null);
  const annotation = $derived(props.currentObject);
  const field = $derived(annotation.field);
  const scale = $derived(props.scale);
  const pageIndex = $derived(props.pageIndex);
  const isReadOnly = $derived(!!(field.flag & PDF_FORM_FIELD_FLAG.READONLY));

  $effect(() => {
    if (!scope) return;
    const id = annotation.id;
    return scope.onFieldValueChange((event) => {
      if (event.annotationId === id) {
        renderKey++;
      }
    });
  });

  function handleChangeField(newField: PdfWidgetAnnoField) {
    if (!scope) return;
    scope.setFormFieldValues(pageIndex, deepToRaw(annotation), deepToRaw(newField));
  }

  return {
    get annotation() {
      return annotation;
    },
    get field() {
      return field;
    },
    get scale() {
      return scale;
    },
    get pageIndex() {
      return pageIndex;
    },
    get scope() {
      return scope;
    },
    handleChangeField,
    get renderKey() {
      return renderKey;
    },
    get isReadOnly() {
      return isReadOnly;
    },
  };
}

<script lang="ts">
  import type { PdfWidgetAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import { useFormWidgetState } from '../../hooks/use-form-widget-state.svelte';
  import { useFormDocumentState } from '../../hooks/use-form.svelte';
  import RenderWidget from '../RenderWidget.svelte';
  import ComboboxField from '../fields/ComboboxField.svelte';
  import type { ComboboxFieldProps } from '../../../shared/components/types';

  let props: AnnotationRendererProps<PdfWidgetAnnoObject> = $props();
  const widgetState = useFormWidgetState(props);
  const formDocState = useFormDocumentState(() => props.documentId);
  const comboboxAnnotation = $derived(widgetState.annotation as ComboboxFieldProps['annotation']);

  let wrapperEl: HTMLDivElement;
  let selectEl: HTMLElement | null = null;

  const isFocused = $derived(formDocState.state.selectedFieldId === widgetState.annotation.id);

  $effect(() => {
    if (isFocused && selectEl && document.activeElement !== selectEl) {
      selectEl.focus();
    }
  });

  function handleFocus() {
    if (widgetState.isReadOnly) return;
    widgetState.scope?.selectField(widgetState.annotation.id);
  }

  function handleBlur() {
    requestAnimationFrame(() => {
      if (wrapperEl?.contains(document.activeElement)) return;
      if (widgetState.scope?.getSelectedFieldId() === widgetState.annotation.id) {
        widgetState.scope?.deselectField();
      }
    });
  }

  function selectInputRef(el: HTMLElement | null) {
    selectEl = el;
  }
</script>

<div
  bind:this={wrapperEl}
  style="width: 100%; height: 100%; overflow: hidden; position: relative; cursor: {widgetState.isReadOnly
    ? 'default'
    : 'pointer'}; pointer-events: auto; outline: {isFocused
    ? '2px solid rgba(66, 133, 244, 0.8)'
    : 'none'}; outline-offset: -2px;"
>
  <RenderWidget
    pageIndex={widgetState.pageIndex}
    annotation={widgetState.annotation}
    scaleFactor={widgetState.scale}
    renderKey={widgetState.renderKey}
    style="position: absolute; inset: 0; pointer-events: none;"
  />
  <ComboboxField
    annotation={comboboxAnnotation}
    scale={widgetState.scale}
    pageIndex={widgetState.pageIndex}
    isEditable={true}
    onChangeField={widgetState.handleChangeField}
    onFocus={handleFocus}
    onBlur={handleBlur}
    inputRef={selectInputRef}
  />
</div>

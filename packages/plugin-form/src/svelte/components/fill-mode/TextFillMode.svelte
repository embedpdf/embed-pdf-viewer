<script lang="ts">
  import type { PdfWidgetAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import { useFormWidgetState } from '../../hooks/use-form-widget-state.svelte';
  import { useFormDocumentState } from '../../hooks/use-form.svelte';
  import RenderWidget from '../RenderWidget.svelte';
  import TextField from '../fields/TextField.svelte';
  import type { TextFieldProps } from '../../../shared/components/types';

  let props: AnnotationRendererProps<PdfWidgetAnnoObject> = $props();
  const widgetState = useFormWidgetState(props);
  const formDocState = useFormDocumentState(() => props.documentId);

  let editing = $state(false);
  let inputEl: HTMLElement | null = null;

  const isFocused = $derived(formDocState.state.selectedFieldId === widgetState.annotation.id);

  $effect(() => {
    if (isFocused && inputEl && document.activeElement !== inputEl) {
      inputEl.focus();
    }
  });

  function handleFocus() {
    if (widgetState.isReadOnly) return;
    widgetState.scope?.selectField(widgetState.annotation.id);
    editing = true;
  }

  function handleBlur() {
    editing = false;
    if (widgetState.scope?.getSelectedFieldId() === widgetState.annotation.id) {
      widgetState.scope?.deselectField();
    }
  }

  function handleInputRef(el: HTMLElement | null) {
    inputEl = el;
  }
</script>

<div
  style="width: 100%; height: 100%; overflow: hidden; position: relative; pointer-events: auto; outline: none;"
>
  <RenderWidget
    pageIndex={widgetState.pageIndex}
    annotation={widgetState.annotation}
    scaleFactor={widgetState.scale}
    renderKey={widgetState.renderKey}
    style="position: absolute; inset: 0; pointer-events: none; visibility: {editing
      ? 'hidden'
      : 'visible'};"
  />
  <div style="position: absolute; inset: 0; z-index: 1; opacity: {editing ? 1 : 0};">
    <TextField
      annotation={widgetState.annotation as TextFieldProps['annotation']}
      scale={widgetState.scale}
      pageIndex={widgetState.pageIndex}
      isEditable={true}
      onChangeField={widgetState.handleChangeField}
      syncExternalValue={!editing}
      onFocus={handleFocus}
      onBlur={handleBlur}
      inputRef={handleInputRef}
    />
  </div>
</div>

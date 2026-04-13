<script lang="ts">
  import type { PdfWidgetAnnoObject } from '@embedpdf/models';
  import { isWidgetChecked } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import { useFormWidgetState } from '../../hooks/use-form-widget-state.svelte';
  import { useFormDocumentState } from '../../hooks/use-form.svelte';
  import RenderWidget from '../RenderWidget.svelte';

  let props: AnnotationRendererProps<PdfWidgetAnnoObject> = $props();
  const widgetState = useFormWidgetState(props);
  const formDocState = useFormDocumentState(() => props.documentId);

  let wrapperEl: HTMLDivElement;

  const isFocused = $derived(formDocState.state.selectedFieldId === widgetState.annotation.id);

  $effect(() => {
    if (isFocused && wrapperEl && document.activeElement !== wrapperEl) {
      wrapperEl.focus();
    }
  });

  function toggle() {
    if (widgetState.isReadOnly) return;
    const checked = isWidgetChecked(widgetState.annotation);
    const newValue = checked ? 'Off' : (widgetState.annotation.exportValue ?? 'Yes');
    widgetState.handleChangeField({ ...widgetState.field, value: newValue });
  }

  function handleClick() {
    if (widgetState.isReadOnly) return;
    widgetState.scope?.selectField(widgetState.annotation.id);
    toggle();
  }

  function handleFocus() {
    if (widgetState.isReadOnly) return;
    widgetState.scope?.selectField(widgetState.annotation.id);
  }

  function handleBlur() {
    if (widgetState.scope?.getSelectedFieldId() === widgetState.annotation.id) {
      widgetState.scope?.deselectField();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={wrapperEl}
  tabindex={widgetState.isReadOnly ? -1 : 0}
  onclick={handleClick}
  onfocus={handleFocus}
  onblur={handleBlur}
  onkeydown={handleKeyDown}
  style="width: 100%; height: 100%; overflow: hidden; cursor: {widgetState.isReadOnly
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
    style="pointer-events: none;"
  />
</div>

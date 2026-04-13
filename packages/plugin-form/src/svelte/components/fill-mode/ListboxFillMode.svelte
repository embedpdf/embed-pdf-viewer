<script lang="ts">
  import type { PdfWidgetAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import { useFormWidgetState } from '../../hooks/use-form-widget-state.svelte';
  import { useFormDocumentState } from '../../hooks/use-form.svelte';
  import RenderWidget from '../RenderWidget.svelte';
  import ListboxField from '../fields/ListboxField.svelte';
  import type { ListboxFieldProps } from '../../../shared/components/types';

  let props: AnnotationRendererProps<PdfWidgetAnnoObject> = $props();
  const widgetState = useFormWidgetState(props);
  const formDocState = useFormDocumentState(() => props.documentId);

  let editing = $state(false);
  let wrapperEl: HTMLDivElement;

  const isFocused = $derived(formDocState.state.selectedFieldId === widgetState.annotation.id);

  $effect(() => {
    if (isFocused && wrapperEl && !wrapperEl.contains(document.activeElement)) {
      wrapperEl.focus();
    }
  });

  function handleFocus() {
    if (widgetState.isReadOnly) return;
    widgetState.scope?.selectField(widgetState.annotation.id);
    editing = true;
  }

  function handleBlur() {
    requestAnimationFrame(() => {
      if (wrapperEl?.contains(document.activeElement)) return;
      editing = false;
      if (widgetState.scope?.getSelectedFieldId() === widgetState.annotation.id) {
        widgetState.scope?.deselectField();
      }
    });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={wrapperEl}
  tabindex={widgetState.isReadOnly ? -1 : 0}
  onfocus={handleFocus}
  onblur={handleBlur}
  style="width: 100%; height: 100%; overflow: hidden; cursor: {widgetState.isReadOnly
    ? 'default'
    : 'pointer'}; pointer-events: auto; outline: {isFocused && !editing
    ? '2px solid rgba(66, 133, 244, 0.8)'
    : 'none'}; outline-offset: -2px;"
>
  <ListboxField
    annotation={widgetState.annotation as ListboxFieldProps['annotation']}
    scale={widgetState.scale}
    pageIndex={widgetState.pageIndex}
    isEditable={true}
    onChangeField={widgetState.handleChangeField}
  />
  {#if !editing}
    <RenderWidget
      pageIndex={widgetState.pageIndex}
      annotation={widgetState.annotation}
      scaleFactor={widgetState.scale}
      renderKey={widgetState.renderKey}
      style="pointer-events: none;"
    />
  {/if}
</div>

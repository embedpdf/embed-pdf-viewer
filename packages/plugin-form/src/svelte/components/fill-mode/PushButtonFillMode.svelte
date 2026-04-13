<script lang="ts">
  import type { PdfWidgetAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import { useFormWidgetState } from '../../hooks/use-form-widget-state.svelte';
  import RenderWidget from '../RenderWidget.svelte';

  let props: AnnotationRendererProps<PdfWidgetAnnoObject> = $props();
  const widgetState = useFormWidgetState(props);
</script>

<div style="width: 100%; height: 100%; overflow: hidden; pointer-events: auto;">
  <RenderWidget
    pageIndex={widgetState.pageIndex}
    annotation={widgetState.annotation}
    scaleFactor={widgetState.scale}
    renderKey={widgetState.renderKey}
    style="pointer-events: none;"
  />
</div>

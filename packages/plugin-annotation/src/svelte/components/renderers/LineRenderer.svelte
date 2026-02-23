<script lang="ts">
  import type { PdfLineAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Line from '../annotations/Line.svelte';

  let {
    currentObject,
    isSelected,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfLineAnnoObject> = $props();
</script>

<Line {...currentObject} {isSelected} {scale} {onClick} {appearanceActive} />

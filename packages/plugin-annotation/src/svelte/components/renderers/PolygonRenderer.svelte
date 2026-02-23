<script lang="ts">
  import type { PdfPolygonAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Polygon from '../annotations/Polygon.svelte';

  let {
    currentObject,
    isSelected,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfPolygonAnnoObject> = $props();
</script>

<Polygon {...currentObject} {isSelected} {scale} {onClick} {appearanceActive} />

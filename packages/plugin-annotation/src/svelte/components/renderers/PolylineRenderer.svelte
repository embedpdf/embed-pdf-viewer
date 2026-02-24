<script lang="ts">
  import type { PdfPolylineAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Polyline from '../annotations/Polyline.svelte';

  let {
    currentObject,
    isSelected,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfPolylineAnnoObject> = $props();
</script>

<Polyline {...currentObject} {isSelected} {scale} {onClick} {appearanceActive} />

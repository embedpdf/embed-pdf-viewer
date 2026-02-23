<script lang="ts">
  import type { PdfCircleAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Circle from '../annotations/Circle.svelte';

  let {
    currentObject,
    isSelected,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfCircleAnnoObject> = $props();
</script>

<Circle {...currentObject} {isSelected} {scale} {onClick} {appearanceActive} />

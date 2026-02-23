<script lang="ts">
  import type { PdfSquareAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Square from '../annotations/Square.svelte';

  let {
    currentObject,
    isSelected,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfSquareAnnoObject> = $props();
</script>

<Square {...currentObject} {isSelected} {scale} {onClick} {appearanceActive} />

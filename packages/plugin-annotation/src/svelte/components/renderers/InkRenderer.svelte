<script lang="ts">
  import type { PdfInkAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Ink from '../annotations/Ink.svelte';

  let {
    currentObject,
    isSelected,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfInkAnnoObject> = $props();
</script>

<Ink {...currentObject} {isSelected} {scale} {onClick} {appearanceActive} />

<script lang="ts">
  import type { PdfTextAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Text from '../annotations/Text.svelte';

  let {
    currentObject,
    isSelected,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfTextAnnoObject> = $props();
</script>

<Text
  {isSelected}
  color={currentObject.strokeColor ?? currentObject.color}
  opacity={currentObject.opacity}
  {onClick}
  {appearanceActive}
/>

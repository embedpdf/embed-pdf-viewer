<script lang="ts">
  import type { PdfCaretAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Caret from '../annotations/Caret.svelte';

  let {
    currentObject,
    isSelected,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfCaretAnnoObject> = $props();
</script>

<Caret {...currentObject} {isSelected} {scale} {onClick} {appearanceActive} />

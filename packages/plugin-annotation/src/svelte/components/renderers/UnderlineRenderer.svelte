<script lang="ts">
  import type { PdfUnderlineAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Underline from '../text-markup/Underline.svelte';

  let {
    currentObject,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfUnderlineAnnoObject> = $props();
</script>

<Underline {...currentObject} {scale} {onClick} {appearanceActive} />

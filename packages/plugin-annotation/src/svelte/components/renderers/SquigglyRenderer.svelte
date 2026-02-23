<script lang="ts">
  import type { PdfSquigglyAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Squiggly from '../text-markup/Squiggly.svelte';

  let {
    currentObject,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfSquigglyAnnoObject> = $props();
</script>

<Squiggly {...currentObject} {scale} {onClick} {appearanceActive} />

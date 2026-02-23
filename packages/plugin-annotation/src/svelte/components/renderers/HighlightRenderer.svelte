<script lang="ts">
  import type { PdfHighlightAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Highlight from '../text-markup/Highlight.svelte';

  let { currentObject, scale, onClick }: AnnotationRendererProps<PdfHighlightAnnoObject> = $props();
</script>

<Highlight {...currentObject} {scale} {onClick} />

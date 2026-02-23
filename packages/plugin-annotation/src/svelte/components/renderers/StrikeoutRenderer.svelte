<script lang="ts">
  import type { PdfStrikeOutAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Strikeout from '../text-markup/Strikeout.svelte';

  let {
    currentObject,
    scale,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfStrikeOutAnnoObject> = $props();
</script>

<Strikeout {...currentObject} {scale} {onClick} {appearanceActive} />

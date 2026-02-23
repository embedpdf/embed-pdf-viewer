<script lang="ts">
  import type { PdfStampAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Stamp from '../annotations/Stamp.svelte';

  let {
    annotation,
    isSelected,
    documentId,
    pageIndex,
    scale,
    onClick,
  }: AnnotationRendererProps<PdfStampAnnoObject> = $props();
</script>

<Stamp {documentId} {isSelected} {annotation} {pageIndex} {scale} {onClick} />

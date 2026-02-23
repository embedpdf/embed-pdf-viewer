<script lang="ts">
  import type { PdfFreeTextAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import FreeText from '../annotations/FreeText.svelte';

  let {
    annotation,
    currentObject,
    isSelected,
    isEditing,
    scale,
    pageIndex,
    documentId,
    onClick,
    appearanceActive,
  }: AnnotationRendererProps<PdfFreeTextAnnoObject> = $props();
</script>

<FreeText
  {documentId}
  {isSelected}
  {isEditing}
  annotation={{ ...annotation, object: currentObject }}
  {pageIndex}
  {scale}
  {onClick}
  {appearanceActive}
/>

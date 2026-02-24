<script lang="ts">
  import type { PdfLinkAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import Link from '../annotations/Link.svelte';

  let { currentObject, isSelected, scale, onClick }: AnnotationRendererProps<PdfLinkAnnoObject> =
    $props();
</script>

<Link {...currentObject} {isSelected} {scale} {onClick} hasIRT={!!currentObject.inReplyToId} />

<script lang="ts">
  import type { PdfLinkAnnoObject } from '@embedpdf/models';
  import type { AnnotationRendererProps } from '../../context/types';
  import { useAnnotationCapability } from '../../hooks';

  let { annotation, documentId }: AnnotationRendererProps<PdfLinkAnnoObject> = $props();

  const { provides } = useAnnotationCapability();

  function handleClick() {
    const target = annotation.object.target;
    if (!target || !provides) return;
    provides.forDocument(documentId).navigateTarget(target);
  }
</script>

<div
  role="link"
  tabindex="-1"
  onclick={handleClick}
  onkeydown={(e) => {
    if (e.key === 'Enter') handleClick();
  }}
  style:width="100%"
  style:height="100%"
  style:cursor="pointer"
  style:pointer-events="auto"
></div>

<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { box, page }: AnnotationRendererProps = $props();

  // page coordinates → this page's pixels, zoom and rotation included
  const point = $derived(page.transform.pageToView({ x: box.x, y: box.y }));
</script>

<div style:position="absolute" style:left="{point.x}px" style:top="{point.y}px">📌</div>

<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { box, page }: AnnotationRendererProps = $props();

  // page coordinates → pixels on this page, at its zoom; the page turns them with it
  const point = $derived(page.transform.toPixels({ x: box.x, y: box.y }));
</script>

<div style:position="absolute" style:left="{point.x}px" style:top="{point.y}px">📌</div>

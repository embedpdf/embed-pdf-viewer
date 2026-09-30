<!-- ApprovedBadge.svelte -->
<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { box, page, native, hovered }: AnnotationRendererProps = $props();
  const rect = $derived(page.transform.pageToViewRect(box));
</script>

{@render native()}
<div
  class="badge"
  class:badge--hover={hovered}
  style:position="absolute"
  style:left="{rect.x + rect.width - 12}px"
  style:top="{rect.y - 12}px"
>
  ✓
</div>

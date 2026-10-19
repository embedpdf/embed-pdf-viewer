<!--
  Your component in one of the viewer's regions: `header`, `footer`, `tabs` or `empty`. It renders
  as a child of the <embedpdf-viewer> element with the region's name for its slot, in an element
  that adds no box.
-->
<script lang="ts">
  import type { RegionProps } from './props';

  let { name, children }: RegionProps = $props();

  // Spread, `slot` is the element's attribute: written out, Svelte reads it as a slot of its own.
  const slot = $derived({ slot: name });
</script>

<div {...slot} style="display: contents">{@render children?.()}</div>

<!--
  What goes inside one of your panels, the one `addPanel(id, …)` adds to the layout: the viewer
  draws its frame, its header and the way it opens. It renders as a child of the <embedpdf-viewer>
  element with the slot `panel:<id>`, in an element that adds no box.
-->
<script lang="ts">
  import type { PanelProps } from './props';

  let { id, children }: PanelProps = $props();

  // Spread, `slot` is the element's attribute: written out, Svelte reads it as a slot of its own.
  const slot = $derived({ slot: `panel:${id}` });
</script>

<div {...slot} style="display: contents">{@render children?.()}</div>

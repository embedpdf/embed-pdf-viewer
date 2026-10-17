<!--
  Your component in the toolbar, where the layout's `{ custom: id }` makes room for it. It renders
  as a child of the <embedpdf-viewer> element with the slot `item:<id>`, in an element that adds
  no box, so it stays in your Svelte tree and lays out in the bar. `useToolbarItem()` inside it
  says where the item sits.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { provideToolbarItem } from './item-context.svelte';
  import type { ToolbarItemProps } from './props';

  let { id, children }: ToolbarItemProps = $props();

  const place = provideToolbarItem();
  let element: HTMLDivElement | undefined = $state();
  $effect(() => {
    const target = element;
    if (!target) return;
    // Reading the attributes writes the context, which this effect must not depend on.
    return untrack(() => place.follow(target));
  });

  // Spread, `slot` is the element's attribute: written out, Svelte reads it as a slot of its own.
  const slot = $derived({ slot: `item:${id}` });
</script>

<div bind:this={element} {...slot} style="display: contents">{@render children?.()}</div>

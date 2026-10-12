<!--
  One element of the toolbar's measurement layer: reports its length along the toolbar (its width,
  or its height in a vertical one) now and whenever it resizes (a new language, a font loading,
  your CSS).
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { observeLength, type Orientation } from '@embedpdf/web';

  let {
    orientation,
    onLength,
    children,
  }: { orientation: Orientation; onLength: (length: number) => void; children?: Snippet } =
    $props();

  let element: HTMLSpanElement | undefined = $state();

  $effect(() => {
    const measured = element;
    const along = orientation;
    if (!measured) return;
    // The report writes the toolbar's lengths, which this effect must not depend on.
    return untrack(() => observeLength(measured, along, (length) => onLength(length)));
  });
</script>

<span bind:this={element} style="display: inline-flex; flex-shrink: 0">{@render children?.()}</span>

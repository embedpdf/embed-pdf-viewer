<!--
  One element of the toolbar's measurement layer: reports its width now and whenever it resizes
  (a new language, a font loading, your CSS).
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { observeWidth } from '@embedpdf/web';

  let { onWidth, children }: { onWidth: (width: number) => void; children?: Snippet } = $props();

  let element: HTMLSpanElement | undefined = $state();

  $effect(() => {
    const measured = element;
    if (!measured) return;
    // The report writes the toolbar's widths, which this effect must not depend on.
    return untrack(() => observeWidth(measured, (width) => onWidth(width)));
  });
</script>

<span bind:this={element} style="display: inline-flex; flex-shrink: 0">{@render children?.()}</span>

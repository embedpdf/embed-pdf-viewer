<script lang="ts">
  import { useViewportCapability, useViewportRef } from '../hooks';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type ViewportProps = HTMLAttributes<HTMLDivElement> & {
    children: Snippet;
    class?: string;
  };

  let { children, class: propsClass, ...restProps }: ViewportProps = $props();

  let viewportGap = $state(0);

  let viewportRef = $derived(useViewportRef());

  const { provides } = $derived(useViewportCapability());

  $effect(() => {
    if (provides) {
      viewportGap = provides.getViewportGap();
    }
  });
</script>

<div
  {...restProps}
  bind:this={viewportRef.containerRef}
  style:width="100%"
  style:height="100%"
  style:overflow="auto"
  style:padding={`${viewportGap}px`}
  class={propsClass}
>
  {@render children()}
</div>

<script lang="ts">
  import { setContext } from 'svelte';
  import { useIsViewportGated, useViewportCapability, useViewportRef } from '../hooks';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type ViewportProps = HTMLAttributes<HTMLDivElement> & {
    /**
     * The ID of the document that this viewport displays
     */
    documentId: string;
    children: Snippet;
    class?: string;
  };

  let { documentId, children, class: propsClass, ...restProps }: ViewportProps = $props();

  let viewportGap = $state(0);

  const viewportRef = useViewportRef(() => documentId);
  const viewportCapability = useViewportCapability();
  const isGated = useIsViewportGated(() => documentId);

  // Provide the viewport element to child components via context
  setContext('viewport-element', {
    get current() {
      return viewportRef.containerRef;
    },
  });

  $effect(() => {
    if (viewportCapability.provides) {
      viewportGap = viewportCapability.provides.getViewportGap();
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
  {#if !isGated.current}
    {@render children()}
  {/if}
</div>

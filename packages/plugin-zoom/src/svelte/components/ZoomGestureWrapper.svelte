<script lang="ts">
  import { useZoomGesture } from '../hooks';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type ZoomGestureWrapperProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
    documentId: string;
    children: Snippet;
    class?: string;
    /** Enable pinch-to-zoom gesture (default: true) */
    enablePinch?: boolean;
    /** Enable wheel zoom with ctrl/cmd key (default: true) */
    enableWheel?: boolean;
  };

  let {
    documentId,
    children,
    class: propsClass,
    enablePinch = true,
    enableWheel = true,
    ...restProps
  }: ZoomGestureWrapperProps = $props();

  const zoomGesture = useZoomGesture(() => documentId, {
    enablePinch: () => enablePinch,
    enableWheel: () => enableWheel,
  });
</script>

<div
  bind:this={zoomGesture.elementRef}
  {...restProps}
  style:display="inline-block"
  style:overflow="visible"
  style:box-sizing="border-box"
  class={propsClass}
>
  {@render children()}
</div>

<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import { useZoomCapability } from '../hooks/use-zoom.svelte';

  interface MarqueeZoomProps {
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page */
    scale: number;
    /** Optional CSS class applied to the marquee rectangle */
    class?: string;
    /** Stroke / fill colours (defaults below) */
    stroke?: string;
    fill?: string;
  }

  let {
    pageIndex,
    scale,
    class: propsClass,
    stroke = 'rgba(33,150,243,0.8)',
    fill = 'rgba(33,150,243,0.15)',
  }: MarqueeZoomProps = $props();

  const zoomCapability = useZoomCapability();
  let rect = $state<Rect | null>(null);

  $effect(() => {
    if (!zoomCapability.provides) return;
    return zoomCapability.provides.registerMarqueeOnPage({
      pageIndex,
      scale,
      callback: { onPreview: (val) => (rect = val) },
    });
  });
</script>

{#if rect}
  <div
    style:position="absolute"
    style:pointer-events="none"
    style:left={`${rect.origin.x * scale}px`}
    style:top={`${rect.origin.y * scale}px`}
    style:width={`${rect.size.width * scale}px`}
    style:height={`${rect.size.height * scale}px`}
    style:border={`1px solid ${stroke}`}
    style:background={fill}
    style:box-sizing="border-box"
    class={propsClass}
  ></div>
{/if}

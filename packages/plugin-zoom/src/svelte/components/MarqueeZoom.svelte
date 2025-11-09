<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useZoomCapability } from '../hooks/use-zoom.svelte';

  interface MarqueeZoomProps {
    /** The ID of the document */
    documentId: string;
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page */
    scale?: number;
    /** Optional CSS class applied to the marquee rectangle */
    class?: string;
    /** Stroke / fill colours (defaults below) */
    stroke?: string;
    fill?: string;
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    class: propsClass,
    stroke = 'rgba(33,150,243,0.8)',
    fill = 'rgba(33,150,243,0.15)',
  }: MarqueeZoomProps = $props();

  const zoomCapability = useZoomCapability();
  const documentState = useDocumentState(documentId);

  let rect = $state<Rect | null>(null);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  $effect(() => {
    rect = null;

    if (!zoomCapability.provides) {
      return;
    }

    return zoomCapability.provides.registerMarqueeOnPage({
      documentId,
      pageIndex,
      scale: actualScale,
      callback: {
        onPreview: (newRect) => {
          rect = newRect;
        },
      },
    });
  });
</script>

{#if rect}
  <div
    style:position="absolute"
    style:pointer-events="none"
    style:left={`${rect.origin.x * actualScale}px`}
    style:top={`${rect.origin.y * actualScale}px`}
    style:width={`${rect.size.width * actualScale}px`}
    style:height={`${rect.size.height * actualScale}px`}
    style:border={`1px solid ${stroke}`}
    style:background={fill}
    style:box-sizing="border-box"
    class={propsClass}
  ></div>
{/if}

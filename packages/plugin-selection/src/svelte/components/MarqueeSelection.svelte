<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useSelectionPlugin } from '../hooks';

  interface MarqueeSelectionProps {
    /** The ID of the document */
    documentId: string;
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page (optional, defaults to document scale) */
    scale?: number;
    /** Optional CSS class applied to the marquee rectangle */
    class?: string;
    /** Stroke colour (default: 'rgba(0,122,204,0.8)') */
    stroke?: string;
    /** Fill colour (default: 'rgba(0,122,204,0.15)') */
    fill?: string;
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    class: propsClass,
    stroke = 'rgba(0,122,204,0.8)',
    fill = 'rgba(0,122,204,0.15)',
  }: MarqueeSelectionProps = $props();

  const selectionPlugin = useSelectionPlugin();
  const documentState = useDocumentState(() => documentId);

  let rect = $state<Rect | null>(null);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  $effect(() => {
    rect = null;

    if (!selectionPlugin.plugin) {
      return;
    }

    return selectionPlugin.plugin.registerMarqueeOnPage({
      documentId,
      pageIndex,
      scale: actualScale,
      onRectChange: (newRect) => {
        rect = newRect;
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
    style:border={`1px dashed ${stroke}`}
    style:background={fill}
    style:box-sizing="border-box"
    style:z-index="1000"
    class={propsClass}
  ></div>
{/if}

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
    /** Fill/background color inside the marquee rectangle. Default: 'rgba(0,122,204,0.15)' */
    background?: string;
    /** Border color of the marquee rectangle. Default: 'rgba(0,122,204,0.8)' */
    borderColor?: string;
    /** Border style. Default: 'dashed' */
    borderStyle?: 'solid' | 'dashed' | 'dotted';
    /**
     * @deprecated Use `borderColor` instead.
     */
    stroke?: string;
    /**
     * @deprecated Use `background` instead.
     */
    fill?: string;
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    class: propsClass,
    background,
    borderColor,
    borderStyle = 'dashed',
    stroke,
    fill,
  }: MarqueeSelectionProps = $props();

  const selectionPlugin = useSelectionPlugin();
  const documentState = useDocumentState(() => documentId);

  // Resolve deprecated props: new CSS-standard props take precedence
  const resolvedBorderColor = $derived(borderColor ?? stroke ?? 'rgba(0,122,204,0.8)');
  const resolvedBackground = $derived(background ?? fill ?? 'rgba(0,122,204,0.15)');

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
    style:border={`1px ${borderStyle} ${resolvedBorderColor}`}
    style:background={resolvedBackground}
    style:box-sizing="border-box"
    style:z-index="1000"
    class={propsClass}
  ></div>
{/if}

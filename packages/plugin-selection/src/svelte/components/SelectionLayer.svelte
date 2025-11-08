<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import { useSelectionPlugin } from '../hooks/use-selection.svelte';

  interface SelectionLayerProps {
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page */
    scale: number;
    /** Background color for selection rectangles */
    background?: string;
  }

  let { pageIndex, scale, background = 'rgba(33, 150, 243, 0.4)' }: SelectionLayerProps = $props();

  const selectionPlugin = useSelectionPlugin();
  let rects = $state<Rect[]>([]);
  let boundingRect = $state<Rect | null>(null);

  $effect(() => {
    // Track pageIndex as dependency
    const _pageIndex = pageIndex;

    if (!selectionPlugin.plugin) return;

    return selectionPlugin.plugin.registerSelectionOnPage({
      pageIndex: _pageIndex,
      onRectsChange: ({ rects: newRects, boundingRect: newBoundingRect }) => {
        rects = newRects;
        boundingRect = newBoundingRect;
      },
    });
  });
</script>

{#if boundingRect}
  <div
    style:position="absolute"
    style:left={`${boundingRect.origin.x * scale}px`}
    style:top={`${boundingRect.origin.y * scale}px`}
    style:width={`${boundingRect.size.width * scale}px`}
    style:height={`${boundingRect.size.height * scale}px`}
    style:mix-blend-mode="multiply"
    style:isolation="isolate"
    style:pointer-events="none"
  >
    {#each rects as rect, i (i)}
      <div
        style:position="absolute"
        style:left={`${(rect.origin.x - boundingRect.origin.x) * scale}px`}
        style:top={`${(rect.origin.y - boundingRect.origin.y) * scale}px`}
        style:width={`${rect.size.width * scale}px`}
        style:height={`${rect.size.height * scale}px`}
        style:background
        style:pointer-events="none"
      ></div>
    {/each}
  </div>
{/if}

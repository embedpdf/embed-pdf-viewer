<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useSelectionPlugin } from '../hooks/use-selection.svelte';

  interface SelectionLayerProps {
    /** Document ID */
    documentId: string;
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page (optional, defaults to document scale) */
    scale?: number;
    /** Background color for selection rectangles */
    background?: string;
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    background = 'rgba(33,150,243)',
  }: SelectionLayerProps = $props();

  const selectionPlugin = useSelectionPlugin();
  const documentState = useDocumentState(() => documentId);

  let rects = $state<Rect[]>([]);
  let boundingRect = $state<Rect | null>(null);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  $effect(() => {
    if (!selectionPlugin.plugin || !documentId) {
      rects = [];
      boundingRect = null;
      return;
    }

    return selectionPlugin.plugin.registerSelectionOnPage({
      documentId,
      pageIndex,
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
    style:left={`${boundingRect.origin.x * actualScale}px`}
    style:top={`${boundingRect.origin.y * actualScale}px`}
    style:width={`${boundingRect.size.width * actualScale}px`}
    style:height={`${boundingRect.size.height * actualScale}px`}
    style:mix-blend-mode="multiply"
    style:isolation="isolate"
    style:pointer-events="none"
  >
    {#each rects as rect, i (i)}
      <div
        style:position="absolute"
        style:left={`${(rect.origin.x - boundingRect.origin.x) * actualScale}px`}
        style:top={`${(rect.origin.y - boundingRect.origin.y) * actualScale}px`}
        style:width={`${rect.size.width * actualScale}px`}
        style:height={`${rect.size.height * actualScale}px`}
        style:background
        style:pointer-events="none"
      ></div>
    {/each}
  </div>
{/if}

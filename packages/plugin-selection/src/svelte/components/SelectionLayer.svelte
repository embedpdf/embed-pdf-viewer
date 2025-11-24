<script lang="ts">
  import { Snippet } from 'svelte';
  import type { Rect } from '@embedpdf/models';
  import { Rotation } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { CounterRotate } from '@embedpdf/utils/svelte';
  import type { SelectionMenuPlacement } from '@embedpdf/plugin-selection';
  import { useSelectionPlugin } from '../hooks/use-selection.svelte';
  import type { SelectionMenuProps } from '../types';

  interface SelectionLayerProps {
    /** Document ID */
    documentId: string;
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page (optional, defaults to document scale) */
    scale?: number;
    /** Rotation of the page (optional, defaults to document rotation) */
    rotation?: Rotation;
    /** Background color for selection rectangles */
    background?: string;
    /** Optional selection menu render function */
    selectionMenu?: Snippet<[SelectionMenuProps]>;
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    rotation: rotationOverride,
    background = 'rgba(33,150,243)',
    selectionMenu,
  }: SelectionLayerProps = $props();

  const selectionPlugin = useSelectionPlugin();
  const documentState = useDocumentState(() => documentId);

  let rects = $state<Rect[]>([]);
  let boundingRect = $state<Rect | null>(null);
  let placement = $state<SelectionMenuPlacement | null>(null);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  const actualRotation = $derived(
    rotationOverride !== undefined
      ? rotationOverride
      : (documentState.current?.rotation ?? Rotation.Degree0),
  );

  const shouldRenderMenu = $derived(
    Boolean(selectionMenu && placement && placement.pageIndex === pageIndex && placement.isVisible),
  );

  // Track selection rectangles on this page
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

  // Track menu placement for this document
  $effect(() => {
    if (!selectionPlugin.plugin || !documentId) {
      placement = null;
      return;
    }

    return selectionPlugin.plugin.onMenuPlacement(documentId, (newPlacement) => {
      placement = newPlacement;
    });
  });
</script>

{#if boundingRect}
  <!-- Highlight layer -->
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

  <!-- Selection menu (counter-rotated) -->
  {#if shouldRenderMenu && placement}
    <CounterRotate
      rect={{
        origin: {
          x: placement.rect.origin.x * actualScale,
          y: placement.rect.origin.y * actualScale,
        },
        size: {
          width: placement.rect.size.width * actualScale,
          height: placement.rect.size.height * actualScale,
        },
      }}
      rotation={actualRotation}
    >
      {#snippet children({ rect, menuWrapperProps })}
        {#if selectionMenu && placement}
          {@render selectionMenu({
            rect,
            menuWrapperProps,
            placement,
          })}
        {/if}
      {/snippet}
    </CounterRotate>
  {/if}
{/if}

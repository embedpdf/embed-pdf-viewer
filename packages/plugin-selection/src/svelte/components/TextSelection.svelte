<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Rect } from '@embedpdf/models';
  import { Rotation } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import {
    CounterRotate,
    type MenuWrapperProps,
    type SelectionMenuPlacement,
  } from '@embedpdf/utils/svelte';
  import { useSelectionPlugin } from '../hooks/use-selection.svelte';
  import type {
    SelectionSelectionMenuRenderFn,
    SelectionSelectionMenuProps,
    SelectionSelectionContext,
  } from '../types';
  import type { SelectionMenuPlacement as UtilsSelectionMenuPlacement } from '@embedpdf/plugin-selection';

  interface TextSelectionProps {
    /** Document ID */
    documentId: string;
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page (optional, defaults to document scale) */
    scale?: number;
    /** Rotation of the page (optional, defaults to document rotation) */
    rotation?: Rotation;
    /** Background color for text selection highlights. Default: 'rgba(33,150,243)' */
    background?: string;
    /** Render function for selection menu (schema-driven approach) */
    selectionMenu?: SelectionSelectionMenuRenderFn;
    /** Snippet for custom selection menu (slot-based approach) */
    selectionMenuSnippet?: Snippet<[SelectionSelectionMenuProps]>;
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    rotation: rotationOverride,
    background = 'rgba(33,150,243)',
    selectionMenu,
    selectionMenuSnippet,
  }: TextSelectionProps = $props();

  const selectionPlugin = useSelectionPlugin();
  const documentState = useDocumentState(() => documentId);

  const page = $derived(documentState.current?.document?.pages?.[pageIndex]);

  let rects = $state<Rect[]>([]);
  let boundingRect = $state<Rect | null>(null);
  let placement = $state<UtilsSelectionMenuPlacement | null>(null);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  const actualRotation = $derived.by(() => {
    if (rotationOverride !== undefined) return rotationOverride;
    // Combine page intrinsic rotation with document rotation
    const pageRotation = page?.rotation ?? 0;
    const docRotation = documentState.current?.rotation ?? 0;
    return ((pageRotation + docRotation) % 4) as Rotation;
  });

  // Check if menu should render: placement is valid AND (render fn OR snippet exists)
  const shouldRenderMenu = $derived(
    Boolean(
      placement &&
      placement.pageIndex === pageIndex &&
      placement.isVisible &&
      (selectionMenu || selectionMenuSnippet),
    ),
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

  // --- Selection Menu Logic ---

  // Build context object for selection menu
  function buildContext(): SelectionSelectionContext {
    return {
      type: 'selection',
      pageIndex,
    };
  }

  // Build placement hints from plugin placement data
  function buildMenuPlacement(): SelectionMenuPlacement {
    return {
      suggestTop: placement?.suggestTop ?? false,
      spaceAbove: placement?.spaceAbove ?? 0,
      spaceBelow: placement?.spaceBelow ?? 0,
    };
  }

  // Build menu props
  function buildMenuProps(
    rect: Rect,
    menuWrapperProps: MenuWrapperProps,
  ): SelectionSelectionMenuProps {
    return {
      context: buildContext(),
      selected: true, // Selection is always "selected" when visible
      rect,
      placement: buildMenuPlacement(),
      menuWrapperProps,
    };
  }
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
        {@const menuProps = buildMenuProps(rect, menuWrapperProps)}
        {#if selectionMenu}
          <!-- Priority 1: Render function (schema-driven) -->
          {@const result = selectionMenu(menuProps)}
          {#if result}
            <result.component {...result.props} />
          {/if}
        {:else if selectionMenuSnippet}
          <!-- Priority 2: Snippet (manual customization) -->
          {@render selectionMenuSnippet(menuProps)}
        {/if}
      {/snippet}
    </CounterRotate>
  {/if}
{/if}

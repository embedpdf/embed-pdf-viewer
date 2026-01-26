<!-- GroupSelectionBox.svelte -->
<script lang="ts">
  import { boundingRectOrEmpty, type Rect } from '@embedpdf/models';
  import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import {
    useInteractionHandles,
    CounterRotate,
    type MenuWrapperProps,
  } from '@embedpdf/utils/svelte';
  import { useAnnotationPlugin } from '../hooks';
  import type {
    GroupSelectionContext,
    GroupSelectionMenuProps,
    GroupSelectionMenuRenderFn,
    ResizeHandleUI,
  } from '../types';
  import type { Snippet } from 'svelte';

  interface GroupSelectionBoxProps {
    documentId: string;
    pageIndex: number;
    scale: number;
    rotation: number;
    pageWidth: number;
    pageHeight: number;
    /** All selected annotations on this page */
    selectedAnnotations: TrackedAnnotation[];
    /** Whether the group is draggable (all annotations must be group-draggable) */
    isDraggable: boolean;
    /** Whether the group is resizable (all annotations must be group-resizable) */
    isResizable: boolean;
    /** Resize handle UI customization */
    resizeUI?: ResizeHandleUI;
    /** Selection outline color */
    selectionOutlineColor?: string;
    /** Outline offset */
    outlineOffset?: number;
    /** Z-index for the group box */
    zIndex?: number;
    /** Group selection menu render function */
    groupSelectionMenu?: GroupSelectionMenuRenderFn;
    /** Snippet for custom group selection menu (slot-based approach) */
    groupSelectionMenuSnippet?: Snippet<[GroupSelectionMenuProps]>;
  }

  let {
    documentId,
    pageIndex,
    scale,
    rotation,
    pageWidth,
    pageHeight,
    selectedAnnotations,
    isDraggable,
    isResizable,
    resizeUI,
    selectionOutlineColor = '#007ACC',
    outlineOffset = 2,
    zIndex = 100,
    groupSelectionMenu,
    groupSelectionMenuSnippet,
  }: GroupSelectionBoxProps = $props();

  const annotationPlugin = useAnnotationPlugin();
  let gestureBase = $state<Rect | null>(null);
  let isDraggingRef = $state(false);
  let isResizingRef = $state(false);

  // Helper to compute group box on demand
  function getGroupBox(): Rect {
    const rects = selectedAnnotations.map((ta) => ta.object.rect);
    return boundingRectOrEmpty(rects);
  }

  // Compute the group bounding box from all selected annotations (for reactive bindings)
  const groupBox = $derived.by(getGroupBox);

  // Preview state for the group box during drag/resize
  let previewGroupBox = $state<Rect>(getGroupBox());

  // Sync preview with actual group box when not dragging/resizing
  $effect(() => {
    if (!isDraggingRef && !isResizingRef) {
      const newBox = groupBox;
      // Only update if values actually changed (not just object reference)
      if (
        previewGroupBox.origin.x !== newBox.origin.x ||
        previewGroupBox.origin.y !== newBox.origin.y ||
        previewGroupBox.size.width !== newBox.size.width ||
        previewGroupBox.size.height !== newBox.size.height
      ) {
        previewGroupBox = newBox;
      }
    }
  });

  // UI constants
  const HANDLE_COLOR = $derived(resizeUI?.color ?? '#007ACC');
  const HANDLE_SIZE = $derived(resizeUI?.size ?? 12);

  // Use interaction handles for both drag and resize
  const interactionHandles = useInteractionHandles(() => ({
    controller: {
      element: previewGroupBox,
      constraints: {
        minWidth: 20,
        minHeight: 20,
        boundingBox: { width: pageWidth, height: pageHeight },
      },
      maintainAspectRatio: false,
      pageRotation: rotation,
      scale: scale,
      enabled: true,
      onUpdate: (event) => {
        if (!event.transformData?.type) return;
        if (!annotationPlugin.plugin) return;

        const plugin = annotationPlugin.plugin;
        const transformType = event.transformData.type;
        const isMove = transformType === 'move';
        const isResize = transformType === 'resize';

        // Skip drag operations if group is not draggable
        if (isMove && !isDraggable) return;

        if (event.state === 'start') {
          gestureBase = getGroupBox();

          if (isMove) {
            isDraggingRef = true;
            // Use unified drag API - plugin handles attached links automatically
            plugin.startDrag(documentId, {
              annotationIds: selectedAnnotations.map((ta) => ta.object.id),
              pageSize: { width: pageWidth, height: pageHeight },
            });
          } else if (isResize) {
            isResizingRef = true;
            // Use unified resize API - plugin handles attached links automatically
            plugin.startResize(documentId, {
              annotationIds: selectedAnnotations.map((ta) => ta.object.id),
              pageSize: { width: pageWidth, height: pageHeight },
              resizeHandle: event.transformData.metadata?.handle ?? 'se',
            });
          }
        }

        const base = gestureBase ?? getGroupBox();

        if (isMove && event.transformData.changes.rect) {
          // Calculate delta from original position
          const newRect = event.transformData.changes.rect;
          const rawDelta = {
            x: newRect.origin.x - base.origin.x,
            y: newRect.origin.y - base.origin.y,
          };

          // Plugin clamps delta and emits events (attached links receive updates too)
          const clampedDelta = plugin.updateDrag(documentId, rawDelta);

          // Update preview group box with clamped delta
          previewGroupBox = {
            ...base,
            origin: {
              x: base.origin.x + clampedDelta.x,
              y: base.origin.y + clampedDelta.y,
            },
          };
        } else if (isResize && event.transformData.changes.rect) {
          const newGroupBox = event.transformData.changes.rect;

          // Plugin computes rects for all participants and emits events
          plugin.updateResize(documentId, newGroupBox);

          // Update preview
          previewGroupBox = newGroupBox;
        }

        if (event.state === 'end') {
          gestureBase = null;

          if (isMove && isDraggingRef) {
            isDraggingRef = false;
            // Plugin commits all patches (selected + attached links) - no patch building needed!
            plugin.commitDrag(documentId);
          } else if (isResize && isResizingRef) {
            isResizingRef = false;
            // Plugin commits all patches (selected + attached links) - no patch building needed!
            plugin.commitResize(documentId);
          }
        }
      },
    },
    resizeUI: {
      handleSize: HANDLE_SIZE,
      spacing: outlineOffset,
      offsetMode: 'outside',
      includeSides: true,
      zIndex: zIndex + 1,
    },
    vertexUI: {
      vertexSize: 0,
      zIndex: zIndex,
    },
    includeVertices: false,
  }));

  // Derived accessors for template
  const resizeHandles = $derived(interactionHandles.resize);

  // --- Group Selection Menu Logic ---

  // Check if we should show menu
  const shouldShowMenu = $derived(!!groupSelectionMenu || !!groupSelectionMenuSnippet);

  // Build context object for group selection menu
  function buildContext(): GroupSelectionContext {
    return {
      type: 'group',
      annotations: selectedAnnotations,
      pageIndex,
    };
  }

  // Build menu props
  function buildMenuProps(rect: Rect, menuWrapperProps: MenuWrapperProps): GroupSelectionMenuProps {
    return {
      context: buildContext(),
      selected: true,
      rect,
      placement: { suggestTop: false },
      menuWrapperProps,
    };
  }
</script>

{#if selectedAnnotations.length >= 2}
  <div data-group-selection-box data-no-interaction>
    <!-- Group box - draggable only if isDraggable is true -->
    <div
      {...isDraggable
        ? interactionHandles.dragProps
        : { onpointerdown: (e: PointerEvent) => e.stopPropagation() }}
      style:position="absolute"
      style:left="{previewGroupBox.origin.x * scale}px"
      style:top="{previewGroupBox.origin.y * scale}px"
      style:width="{previewGroupBox.size.width * scale}px"
      style:height="{previewGroupBox.size.height * scale}px"
      style:outline="2px dashed {selectionOutlineColor}"
      style:outline-offset="{outlineOffset - 1}px"
      style:cursor={isDraggable ? 'move' : 'default'}
      style:touch-action="none"
      style:z-index={zIndex}
    >
      <!-- Resize handles -->
      {#if isResizable}
        {#each resizeHandles as { key, style: handleStyle, ...hProps } (key)}
          {#if resizeUI?.component}
            {@render resizeUI.component({ ...hProps, backgroundColor: HANDLE_COLOR })}
          {:else}
            <div {...hProps} style="{handleStyle}; background-color: {HANDLE_COLOR};"></div>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Group selection menu -->
    {#if shouldShowMenu}
      <CounterRotate
        rect={{
          origin: {
            x: previewGroupBox.origin.x * scale,
            y: previewGroupBox.origin.y * scale,
          },
          size: {
            width: previewGroupBox.size.width * scale,
            height: previewGroupBox.size.height * scale,
          },
        }}
        {rotation}
      >
        {#snippet children({ rect, menuWrapperProps })}
          {@const menuProps = buildMenuProps(rect, menuWrapperProps)}
          {#if groupSelectionMenu}
            <!-- Priority 1: Render function (schema-driven) -->
            {@const result = groupSelectionMenu(menuProps)}
            {#if result}
              <result.component {...result.props} />
            {/if}
          {:else if groupSelectionMenuSnippet}
            <!-- Priority 2: Snippet (manual customization) -->
            {@render groupSelectionMenuSnippet(menuProps)}
          {/if}
        {/snippet}
      </CounterRotate>
    {/if}
  </div>
{/if}

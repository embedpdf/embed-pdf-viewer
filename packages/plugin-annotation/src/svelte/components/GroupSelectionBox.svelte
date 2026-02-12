<!-- GroupSelectionBox.svelte -->
<script lang="ts">
  import { boundingRectOrEmpty, type Rect } from '@embedpdf/models';
  import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import {
    useInteractionHandles,
    CounterRotate,
    type MenuWrapperProps,
  } from '@embedpdf/utils/svelte';
  import { useDocumentPermissions } from '@embedpdf/core/svelte';
  import { useAnnotationPlugin } from '../hooks';
  import type {
    GroupSelectionContext,
    GroupSelectionMenuProps,
    GroupSelectionMenuRenderFn,
    ResizeHandleUI,
    RotationHandleUI,
    SelectionOutline,
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
    /** Whether the group can be rotated */
    isRotatable?: boolean;
    /** Whether to lock aspect ratio during group resize */
    lockAspectRatio?: boolean;
    /** Resize handle UI customization */
    resizeUI?: ResizeHandleUI;
    /** Rotation handle UI customization */
    rotationUI?: RotationHandleUI;
    /** @deprecated Use `selectionOutline.color` instead */
    selectionOutlineColor?: string;
    /** @deprecated Use `selectionOutline.offset` instead */
    outlineOffset?: number;
    /** Customize the selection outline (color, style, width, offset) */
    selectionOutline?: SelectionOutline;
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
    isRotatable = true,
    lockAspectRatio = false,
    resizeUI,
    rotationUI,
    selectionOutlineColor,
    outlineOffset,
    selectionOutline,
    zIndex = 2,
    groupSelectionMenu,
    groupSelectionMenuSnippet,
  }: GroupSelectionBoxProps = $props();

  const annotationPlugin = useAnnotationPlugin();
  const permissions = useDocumentPermissions(() => documentId);
  let gestureBase = $state<Rect | null>(null);
  let isDraggingRef = $state(false);
  let isResizingRef = $state(false);
  let liveRotation = $state<number | null>(null);
  let cursorScreen = $state<{ x: number; y: number } | null>(null);
  let isHandleHovered = $state(false);

  // Check permissions before allowing drag/resize/rotate
  const effectiveIsDraggable = $derived(permissions.canModifyAnnotations && isDraggable);
  const effectiveIsResizable = $derived(permissions.canModifyAnnotations && isResizable);
  const effectiveIsRotatable = $derived(permissions.canModifyAnnotations && isRotatable);

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

  // Subscribe to rotation end events to clear live rotation
  $effect(() => {
    const plugin = annotationPlugin.plugin;
    if (!plugin) return;
    const unsubscribe = plugin.onRotateChange((event: { documentId: string; type: string }) => {
      if (event.documentId !== documentId) return;
      if (event.type === 'end' || event.type === 'cancel') {
        liveRotation = null;
      }
    });
    return unsubscribe;
  });

  // UI constants
  const HANDLE_COLOR = $derived(resizeUI?.color ?? '#007ACC');
  const HANDLE_SIZE = $derived(resizeUI?.size ?? 12);
  const ROTATION_COLOR = $derived(rotationUI?.color ?? HANDLE_COLOR);
  const ROTATION_CONNECTOR_COLOR = $derived(rotationUI?.connectorColor ?? ROTATION_COLOR);
  const ROTATION_SIZE = $derived(rotationUI?.size ?? 32);
  const ROTATION_MARGIN = $derived(rotationUI?.margin);
  const ROTATION_ICON_COLOR = $derived(rotationUI?.iconColor ?? 'white');
  const SHOW_CONNECTOR = $derived(rotationUI?.showConnector ?? false);

  // Outline resolution (new object > deprecated props > group defaults)
  const outlineColor = $derived(selectionOutline?.color ?? selectionOutlineColor ?? '#007ACC');
  const outlineStyleVal = $derived(selectionOutline?.style ?? 'dashed');
  const outlineWidthVal = $derived(selectionOutline?.width ?? 2);
  const outlineOff = $derived(selectionOutline?.offset ?? outlineOffset ?? 2);

  const groupRotationDisplay = $derived(liveRotation ?? 0);
  const rotationActive = $derived(liveRotation !== null);
  const normalizedRotationDisplay = $derived(
    Number.isFinite(groupRotationDisplay) ? Math.round(groupRotationDisplay * 10) / 10 : 0,
  );

  // Group box dimensions for guide lines and rotation handle positioning
  const groupBoxWidth = $derived(previewGroupBox.size.width * scale);
  const groupBoxHeight = $derived(previewGroupBox.size.height * scale);
  const groupCenterX = $derived(groupBoxWidth / 2);
  const groupCenterY = $derived(groupBoxHeight / 2);
  const groupGuideLength = $derived(Math.max(300, Math.max(groupBoxWidth, groupBoxHeight) + 80));

  // Use interaction handles for both drag, resize, and rotation
  const interactionHandles = useInteractionHandles(() => ({
    controller: {
      element: previewGroupBox,
      constraints: {
        minWidth: 20,
        minHeight: 20,
        boundingBox: { width: pageWidth, height: pageHeight },
      },
      maintainAspectRatio: lockAspectRatio,
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
        if (isMove && !effectiveIsDraggable) return;

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

        // Rotation handling
        if (transformType === 'rotate') {
          if (!isRotatable) return;
          const ids = selectedAnnotations.map((ta) => ta.object.id);
          const cursorAngle = event.transformData.metadata?.rotationAngle ?? 0;
          const cursorPos = event.transformData.metadata?.cursorPosition;
          if (cursorPos) cursorScreen = { x: cursorPos.clientX, y: cursorPos.clientY };
          if (event.state === 'start') {
            liveRotation = cursorAngle;
            plugin.startRotation(documentId, {
              annotationIds: ids,
              cursorAngle,
              rotationCenter: event.transformData.metadata?.rotationCenter,
            });
          } else if (event.state === 'move') {
            liveRotation = cursorAngle;
            plugin.updateRotation(
              documentId,
              cursorAngle,
              event.transformData.metadata?.rotationDelta,
            );
          } else if (event.state === 'end') {
            liveRotation = null;
            cursorScreen = null;
            plugin.commitRotation(documentId);
          }
          return;
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
      spacing: outlineOff,
      offsetMode: 'outside',
      includeSides: !lockAspectRatio,
      zIndex: zIndex + 1,
    },
    vertexUI: {
      vertexSize: 0,
      zIndex: zIndex,
    },
    rotationUI: {
      handleSize: ROTATION_SIZE,
      margin: ROTATION_MARGIN,
      zIndex: zIndex + 2,
      showConnector: SHOW_CONNECTOR,
    },
    includeVertices: false,
    includeRotation: effectiveIsRotatable,
    currentRotation: liveRotation ?? 0,
  }));

  // Derived accessors for template
  const resizeHandles = $derived(interactionHandles.resize);
  const rotationHandle = $derived(interactionHandles.rotation);

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
    // The handle's visual angle = groupRotationDisplay + pageRotation (in degrees).
    // `rotation` is in quarter turns (0-3), so multiply by 90 to get degrees.
    // The menu (suggestTop: false) renders at the visual bottom (180deg).
    // Flip the menu to the top when the handle is in the bottom visual hemisphere
    // to prevent it from overlapping with the rotation handle.
    const effectiveAngle = (((groupRotationDisplay + rotation * 90) % 360) + 360) % 360;
    const handleNearMenuSide = effectiveIsRotatable && effectiveAngle > 90 && effectiveAngle < 270;

    return {
      context: buildContext(),
      selected: true,
      rect,
      placement: { suggestTop: handleNearMenuSide },
      menuWrapperProps,
    };
  }

  // Svelte action for portaling tooltip to document.body
  function portalToBody(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode === document.body) {
          document.body.removeChild(node);
        }
      },
    };
  }
</script>

{#if selectedAnnotations.length >= 2}
  <div data-group-selection-box data-no-interaction>
    <!-- Outer div: AABB container - stable center for help lines and rotation handle -->
    <div
      style:position="absolute"
      style:left="{previewGroupBox.origin.x * scale}px"
      style:top="{previewGroupBox.origin.y * scale}px"
      style:width="{groupBoxWidth}px"
      style:height="{groupBoxHeight}px"
      style:pointer-events="none"
      style:z-index={zIndex}
    >
      <!-- Rotation guide lines - anchored at stable center -->
      {#if rotationActive}
        <!-- Fixed snap lines (cross at 0/90/180/270) -->
        <div
          style:position="absolute"
          style:left="{groupCenterX - groupGuideLength / 2}px"
          style:top="{groupCenterY}px"
          style:width="{groupGuideLength}px"
          style:height="1px"
          style:background-color={HANDLE_COLOR}
          style:opacity="0.35"
          style:pointer-events="none"
        ></div>
        <div
          style:position="absolute"
          style:left="{groupCenterX}px"
          style:top="{groupCenterY - groupGuideLength / 2}px"
          style:width="1px"
          style:height="{groupGuideLength}px"
          style:background-color={HANDLE_COLOR}
          style:opacity="0.35"
          style:pointer-events="none"
        ></div>
        <!-- Rotating indicator line showing current angle -->
        <div
          style:position="absolute"
          style:left="{groupCenterX - groupGuideLength / 2}px"
          style:top="{groupCenterY}px"
          style:width="{groupGuideLength}px"
          style:height="1px"
          style:transform-origin="center center"
          style:transform="rotate({groupRotationDisplay}deg)"
          style:background-color={HANDLE_COLOR}
          style:opacity="0.8"
          style:pointer-events="none"
        ></div>
      {/if}

      <!-- Rotation handle - orbits in AABB space -->
      {#if effectiveIsRotatable && rotationHandle}
        {#if rotationUI?.component}
          <div
            onpointerenter={() => (isHandleHovered = true)}
            onpointerleave={() => {
              isHandleHovered = false;
              cursorScreen = null;
            }}
            onpointermove={(e) => {
              if (!rotationActive) cursorScreen = { x: e.clientX, y: e.clientY };
            }}
            style="display: contents;"
          >
            {@render rotationUI.component({
              ...rotationHandle.handle,
              backgroundColor: ROTATION_COLOR,
              iconColor: ROTATION_ICON_COLOR,
              connectorStyle: `${rotationHandle.connector.style}; background-color: ${ROTATION_CONNECTOR_COLOR}; opacity: ${rotationActive ? 0 : 1};`,
              showConnector: SHOW_CONNECTOR,
              opacity: rotationActive ? 0 : 1,
            })}
          </div>
        {:else}
          <div
            onpointerenter={() => (isHandleHovered = true)}
            onpointerleave={() => {
              isHandleHovered = false;
              cursorScreen = null;
            }}
            onpointermove={(e) => {
              if (!rotationActive) cursorScreen = { x: e.clientX, y: e.clientY };
            }}
            style="display: contents;"
          >
            <!-- Connector line -->
            {#if SHOW_CONNECTOR}
              <div
                style="{rotationHandle.connector
                  .style}; background-color: {ROTATION_CONNECTOR_COLOR}; opacity: {rotationActive
                  ? 0
                  : 1};"
              ></div>
            {/if}
            <!-- Rotation handle -->
            <div
              {...{
                onpointerdown: rotationHandle.handle.onpointerdown,
                onpointermove: rotationHandle.handle.onpointermove,
                onpointerup: rotationHandle.handle.onpointerup,
                onpointercancel: rotationHandle.handle.onpointercancel,
              }}
              style="{rotationHandle.handle
                .style}; background-color: {ROTATION_COLOR}; display: flex; align-items: center; justify-content: center; pointer-events: auto; opacity: {rotationActive
                ? 0
                : 1};"
            >
              <svg
                width={Math.round(ROTATION_SIZE * 0.6)}
                height={Math.round(ROTATION_SIZE * 0.6)}
                viewBox="0 0 24 24"
                fill="none"
                stroke={ROTATION_ICON_COLOR}
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </div>
          </div>
        {/if}
      {/if}

      <!-- Inner div: group content area with outline and resize handles -->
      <div
        {...effectiveIsDraggable
          ? interactionHandles.dragProps
          : { onpointerdown: (e: PointerEvent) => e.stopPropagation() }}
        style:position="absolute"
        style:left="0px"
        style:top="0px"
        style:width="{groupBoxWidth}px"
        style:height="{groupBoxHeight}px"
        style:outline={rotationActive
          ? 'none'
          : `${outlineWidthVal}px ${outlineStyleVal} ${outlineColor}`}
        style:outline-offset="{outlineOff - 1}px"
        style:cursor={effectiveIsDraggable ? 'move' : 'default'}
        style:touch-action="none"
        style:pointer-events="auto"
      >
        <!-- Resize handles -->
        {#if effectiveIsResizable && !rotationActive}
          {#each resizeHandles as { key, style: handleStyle, ...hProps } (key)}
            {#if resizeUI?.component}
              {@render resizeUI.component({ ...hProps, backgroundColor: HANDLE_COLOR })}
            {:else}
              <div {...hProps} style="{handleStyle}; background-color: {HANDLE_COLOR};"></div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>

    <!-- Cursor-following rotation tooltip -->
    {#if (rotationActive || isHandleHovered) && cursorScreen}
      <div use:portalToBody>
        <div
          style:position="fixed"
          style:left="{cursorScreen.x + 16}px"
          style:top="{cursorScreen.y - 16}px"
          style:background="rgba(0,0,0,0.8)"
          style:color="#fff"
          style:padding="4px 8px"
          style:border-radius="4px"
          style:font-size="12px"
          style:font-family="monospace"
          style:pointer-events="none"
          style:z-index="10000"
          style:white-space="nowrap"
        >
          {normalizedRotationDisplay.toFixed(0)}°
        </div>
      </div>
    {/if}

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

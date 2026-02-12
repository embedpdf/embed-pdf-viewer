<script lang="ts" generics="T extends PdfAnnotationObject">
  import type { PdfAnnotationObject, Rect } from '@embedpdf/models';
  import { useDocumentPermissions } from '@embedpdf/core/svelte';
  import { useAnnotationCapability, useAnnotationPlugin } from '../hooks';
  import type { AnnotationContainerProps } from './types';
  import {
    useInteractionHandles,
    doublePress,
    CounterRotate,
    deepToRaw,
    type SelectionMenuPlacement,
    type MenuWrapperProps,
  } from '@embedpdf/utils/svelte';
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import { type AnnotationSelectionContext, type AnnotationSelectionMenuProps } from '../types';
  import { inferRotationCenterFromRects } from '../../lib/geometry/rotation';

  let {
    documentId,
    scale,
    pageIndex,
    rotation,
    pageWidth,
    pageHeight,
    trackedAnnotation,
    children,
    isSelected,
    isMultiSelected = false,
    isDraggable,
    isResizable,
    isRotatable = true,
    lockAspectRatio = false,
    style,
    class: propsClass = '',
    vertexConfig,
    selectionMenu,
    selectionMenuSnippet,
    outlineOffset = 1,
    onDoubleClick,
    onSelect,
    zIndex = 1,
    resizeUI,
    vertexUI,
    rotationUI,
    selectionOutlineColor,
    selectionOutline,
    customAnnotationRenderer,
    // Destructure props that shouldn't be passed to DOM elements
    groupSelectionMenu: _groupSelectionMenu,
    groupSelectionOutline: _groupSelectionOutline,
    annotationRenderers: _annotationRenderers,
    ...restProps
  }: AnnotationContainerProps<T> = $props();

  let preview = $state<T>(trackedAnnotation.object);
  let liveRotation = $state<number | null>(null);
  let cursorScreen = $state<{ x: number; y: number } | null>(null);
  let isHandleHovered = $state(false);
  let annotationCapability = useAnnotationCapability();
  const annotationPlugin = useAnnotationPlugin();
  const permissions = useDocumentPermissions(() => documentId);
  let gestureBaseRef = $state<T | null>(null);
  let gestureBaseRectRef = $state<Rect | null>(null);

  // When multi-selected, disable individual drag/resize - GroupSelectionBox handles it
  const effectiveIsDraggable = $derived(
    permissions.canModifyAnnotations && isDraggable && !isMultiSelected,
  );
  const effectiveIsResizable = $derived(
    permissions.canModifyAnnotations && isResizable && !isMultiSelected,
  );
  const effectiveIsRotatable = $derived(
    permissions.canModifyAnnotations && isRotatable && !isMultiSelected,
  );

  // Wrap onDoubleClick to respect permissions
  const guardedOnDoubleClick = $derived(
    permissions.canModifyAnnotations && onDoubleClick ? onDoubleClick : undefined,
  );

  // Get scoped API for this document
  const annotationProvides = $derived(
    annotationCapability.provides ? annotationCapability.provides.forDocument(documentId) : null,
  );

  let currentObject = $derived<T>(
    preview ? { ...trackedAnnotation.object, ...preview } : trackedAnnotation.object,
  );

  // UI constants
  const HANDLE_COLOR = $derived(resizeUI?.color ?? '#007ACC');
  const VERTEX_COLOR = $derived(vertexUI?.color ?? '#007ACC');
  const ROTATION_COLOR = $derived(rotationUI?.color ?? '#007ACC');
  const ROTATION_CONNECTOR_COLOR = $derived(rotationUI?.connectorColor ?? ROTATION_COLOR);
  const HANDLE_SIZE = $derived(resizeUI?.size ?? 12);
  const VERTEX_SIZE = $derived(vertexUI?.size ?? 12);
  const ROTATION_SIZE = $derived(rotationUI?.size ?? 32);
  const ROTATION_MARGIN = $derived(rotationUI?.margin);
  const ROTATION_ICON_COLOR = $derived(rotationUI?.iconColor ?? 'white');
  const SHOW_CONNECTOR = $derived(rotationUI?.showConnector ?? false);

  // Outline resolution (new object > deprecated props > defaults)
  const outlineColor = $derived(selectionOutline?.color ?? selectionOutlineColor ?? '#007ACC');
  const outlineStyleVal = $derived(selectionOutline?.style ?? 'solid');
  const outlineWidth = $derived(selectionOutline?.width ?? 1);
  const outlineOff = $derived(selectionOutline?.offset ?? outlineOffset ?? 1);

  // Get annotation's current rotation (for simple shapes that store rotation)
  // During drag, use liveRotation if available; otherwise use the annotation's rotation
  const annotationRotation = $derived(liveRotation ?? (currentObject as any).rotation ?? 0);
  const rotationDisplay = $derived(liveRotation ?? (currentObject as any).rotation ?? 0);
  const normalizedRotationDisplay = $derived(
    Number.isFinite(rotationDisplay) ? Math.round(rotationDisplay * 10) / 10 : 0,
  );
  const rotationActive = $derived(liveRotation !== null);

  // Determine if we should show the outline
  // When multi-selected, don't show individual outlines - GroupSelectionBox shows the group outline
  const showOutline = $derived(isSelected && !isMultiSelected);

  // Geometry model:
  // - `rect` is the visible AABB container.
  // - `unrotatedRect` is the local editing frame for resize/vertex operations.
  const explicitUnrotatedRect = $derived((currentObject as any).unrotatedRect as Rect | undefined);
  const effectiveUnrotatedRect = $derived(explicitUnrotatedRect ?? currentObject.rect);
  const rotationPivot = $derived(
    explicitUnrotatedRect && annotationRotation !== 0
      ? inferRotationCenterFromRects(effectiveUnrotatedRect, currentObject.rect, annotationRotation)
      : undefined,
  );
  const controllerElement = $derived(effectiveUnrotatedRect);

  // Three-layer model dimensions
  const aabbWidth = $derived(currentObject.rect.size.width * scale);
  const aabbHeight = $derived(currentObject.rect.size.height * scale);
  const innerWidth = $derived(effectiveUnrotatedRect.size.width * scale);
  const innerHeight = $derived(effectiveUnrotatedRect.size.height * scale);
  const usesCustomPivot = $derived(Boolean(explicitUnrotatedRect) && annotationRotation !== 0);
  const innerLeft = $derived(
    usesCustomPivot
      ? (effectiveUnrotatedRect.origin.x - currentObject.rect.origin.x) * scale
      : (aabbWidth - innerWidth) / 2,
  );
  const innerTop = $derived(
    usesCustomPivot
      ? (effectiveUnrotatedRect.origin.y - currentObject.rect.origin.y) * scale
      : (aabbHeight - innerHeight) / 2,
  );
  const innerTransformOrigin = $derived(
    usesCustomPivot && rotationPivot
      ? `${(rotationPivot.x - effectiveUnrotatedRect.origin.x) * scale}px ${(rotationPivot.y - effectiveUnrotatedRect.origin.y) * scale}px`
      : 'center center',
  );
  const centerX = $derived(
    rotationPivot ? (rotationPivot.x - currentObject.rect.origin.x) * scale : aabbWidth / 2,
  );
  const centerY = $derived(
    rotationPivot ? (rotationPivot.y - currentObject.rect.origin.y) * scale : aabbHeight / 2,
  );
  const guideLength = $derived(Math.max(300, Math.max(aabbWidth, aabbHeight) + 80));

  // For children, override rect to use unrotatedRect so content renders in unrotated space
  const childObject = $derived.by(() => {
    if (explicitUnrotatedRect) {
      return { ...currentObject, rect: explicitUnrotatedRect };
    }
    return currentObject;
  });

  // Sync preview with tracked annotation when it changes
  $effect(() => {
    if (trackedAnnotation.object) {
      preview = trackedAnnotation.object;
    }
  });

  // Subscribe to unified drag/resize/rotate changes - plugin sends pre-computed patches!
  // ALL preview updates come through here (primary, attached links, multi-select)
  $effect(() => {
    const plugin = annotationPlugin.plugin;
    if (!plugin) return;

    const id = trackedAnnotation.object.id;

    const handleEvent = (event: {
      documentId: string;
      type: string;
      previewPatches?: Record<string, any>;
    }) => {
      if (event.documentId !== documentId) return;
      if (event.type === 'end' || event.type === 'cancel') {
        liveRotation = null;
      }
      const patch = event.previewPatches?.[id];
      if (event.type === 'update' && patch) {
        // Use untrack to prevent tracking the read of preview (like Vue's toRaw)
        preview = { ...untrack(() => preview), ...patch } as T;
      } else if (event.type === 'cancel') {
        preview = trackedAnnotation.object;
      }
    };

    const unsubs = [
      plugin.onDragChange(handleEvent),
      plugin.onResizeChange(handleEvent),
      plugin.onRotateChange(handleEvent),
    ];

    return () => unsubs.forEach((u) => u());
  });

  const interactionHandles = useInteractionHandles(() => ({
    controller: {
      element: controllerElement,
      vertices: vertexConfig?.extractVertices(currentObject),
      constraints: {
        minWidth: 10,
        minHeight: 10,
        boundingBox: { width: pageWidth, height: pageHeight },
      },
      maintainAspectRatio: lockAspectRatio,
      pageRotation: rotation,
      annotationRotation: annotationRotation,
      rotationCenter: rotationPivot,
      rotationElement: currentObject.rect,
      scale: scale,
      // Disable interaction handles when multi-selected
      enabled: isSelected && !isMultiSelected,
      onUpdate: (event) => {
        if (!event.transformData?.type || isMultiSelected) return;

        const plugin = annotationPlugin.plugin;
        if (!plugin) return;

        const { type, changes, metadata } = event.transformData;
        const id = trackedAnnotation.object.id;
        const pageSize = { width: pageWidth, height: pageHeight };

        // Gesture start - initialize plugin drag/resize
        if (event.state === 'start') {
          // Use unrotatedRect as gesture base so deltas are computed in unrotated space
          gestureBaseRectRef =
            (trackedAnnotation.object as any).unrotatedRect ?? trackedAnnotation.object.rect;
          gestureBaseRef = trackedAnnotation.object; // For vertex edit

          if (type === 'move') {
            plugin.startDrag(documentId, { annotationIds: [id], pageSize });
          } else if (type === 'resize') {
            plugin.startResize(documentId, {
              annotationIds: [id],
              pageSize,
              resizeHandle: metadata?.handle ?? 'se',
            });
          }
        }

        // Gesture update - call plugin, preview comes from subscription
        if (changes.rect && gestureBaseRectRef) {
          if (type === 'move') {
            const delta = {
              x: changes.rect.origin.x - gestureBaseRectRef.origin.x,
              y: changes.rect.origin.y - gestureBaseRectRef.origin.y,
            };
            plugin.updateDrag(documentId, delta);
          } else if (type === 'resize') {
            plugin.updateResize(documentId, changes.rect);
          }
        }

        // Vertex edit - handle directly (no attached link handling needed)
        if (type === 'vertex-edit' && changes.vertices && vertexConfig) {
          const base = gestureBaseRef ?? trackedAnnotation.object;
          const vertexChanges = vertexConfig.transformAnnotation(base, changes.vertices);
          const patched = annotationCapability.provides?.transformAnnotation<T>(base, {
            type,
            changes: vertexChanges as Partial<T>,
            metadata,
          });
          if (patched) {
            preview = { ...preview, ...patched };
            if (event.state === 'end') {
              const sanitized = deepToRaw(patched);
              annotationProvides?.updateAnnotation(pageIndex, id, sanitized);
            }
          }
        }

        // Rotation handling
        if (type === 'rotate') {
          const cursorAngle = metadata?.rotationAngle ?? annotationRotation;
          const cursorPos = metadata?.cursorPosition;
          if (cursorPos) cursorScreen = { x: cursorPos.clientX, y: cursorPos.clientY };
          if (event.state === 'start') {
            liveRotation = cursorAngle;
            plugin.startRotation(documentId, {
              annotationIds: [id],
              cursorAngle,
              rotationCenter: metadata?.rotationCenter,
            });
          } else if (event.state === 'move') {
            liveRotation = cursorAngle;
            plugin.updateRotation(documentId, cursorAngle, metadata?.rotationDelta);
          } else if (event.state === 'end') {
            liveRotation = null;
            cursorScreen = null;
            plugin.commitRotation(documentId);
          }
          return;
        }

        // Gesture end - commit
        if (event.state === 'end') {
          gestureBaseRectRef = null;
          gestureBaseRef = null;
          if (type === 'move') plugin.commitDrag(documentId);
          else if (type === 'resize') plugin.commitResize(documentId);
        }
      },
    },
    resizeUI: {
      handleSize: HANDLE_SIZE,
      spacing: outlineOff,
      offsetMode: 'outside',
      includeSides: lockAspectRatio ? false : true,
      zIndex: zIndex + 1,
    },
    vertexUI: {
      vertexSize: VERTEX_SIZE,
      zIndex: zIndex + 2,
    },
    rotationUI: {
      handleSize: ROTATION_SIZE,
      margin: ROTATION_MARGIN,
      zIndex: zIndex + 3,
      showConnector: SHOW_CONNECTOR,
    },
    includeVertices: vertexConfig ? true : false,
    includeRotation: effectiveIsRotatable,
    currentRotation: annotationRotation,
  }));

  // Derived accessors for template
  const resizeHandles = $derived(interactionHandles.resize);
  const vertexHandles = $derived(interactionHandles.vertices);
  const rotationHandle = $derived(interactionHandles.rotation);

  // --- Selection Menu Logic ---

  // Check if we should show menu - hide when multi-selected or rotating
  const shouldShowMenu = $derived(
    isSelected &&
      !isMultiSelected &&
      !rotationActive &&
      (!!selectionMenu || !!selectionMenuSnippet),
  );

  // Build context object for selection menu
  function buildContext(): AnnotationSelectionContext {
    return {
      type: 'annotation',
      annotation: trackedAnnotation,
      pageIndex,
    };
  }

  // Build menu props
  function buildMenuProps(
    rect: Rect,
    menuWrapperProps: MenuWrapperProps,
  ): AnnotationSelectionMenuProps {
    // The handle's visual angle = annotationRotation + pageRotation (in degrees).
    // `rotation` is in quarter turns (0-3), so multiply by 90 to get degrees.
    // The menu (suggestTop: false) renders at the visual bottom (180deg).
    // Flip the menu to the top when the handle is in the bottom visual hemisphere
    // to prevent it from overlapping with the rotation handle.
    const effectiveAngle = (((annotationRotation + rotation * 90) % 360) + 360) % 360;
    const handleNearMenuSide = effectiveIsRotatable && effectiveAngle > 90 && effectiveAngle < 270;

    return {
      context: buildContext(),
      selected: isSelected,
      rect,
      placement: {
        suggestTop: handleNearMenuSide,
        spaceAbove: 0,
        spaceBelow: 0,
      },
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

<div data-no-interaction>
  <!-- Outer div: AABB container - stable center for help lines and rotation handle -->
  <div
    style:position="absolute"
    style:left="{currentObject.rect.origin.x * scale}px"
    style:top="{currentObject.rect.origin.y * scale}px"
    style:width="{aabbWidth}px"
    style:height="{aabbHeight}px"
    style:pointer-events="none"
    style:z-index={zIndex}
    style={style || ''}
    class={propsClass}
    {...restProps}
  >
    <!-- Rotation guide lines - anchored at stable AABB center -->
    {#if rotationActive}
      <!-- Fixed snap lines (cross at 0/90/180/270) -->
      <div
        style:position="absolute"
        style:left="{centerX - guideLength / 2}px"
        style:top="{centerY}px"
        style:width="{guideLength}px"
        style:height="1px"
        style:background-color={ROTATION_CONNECTOR_COLOR}
        style:opacity="0.35"
        style:pointer-events="none"
      ></div>
      <div
        style:position="absolute"
        style:left="{centerX}px"
        style:top="{centerY - guideLength / 2}px"
        style:width="1px"
        style:height="{guideLength}px"
        style:background-color={ROTATION_CONNECTOR_COLOR}
        style:opacity="0.35"
        style:pointer-events="none"
      ></div>
      <!-- Rotating indicator line showing current angle -->
      <div
        style:position="absolute"
        style:left="{centerX - guideLength / 2}px"
        style:top="{centerY}px"
        style:width="{guideLength}px"
        style:height="1px"
        style:transform-origin="center center"
        style:transform="rotate({annotationRotation}deg)"
        style:background-color={ROTATION_CONNECTOR_COLOR}
        style:opacity="0.8"
        style:pointer-events="none"
      ></div>
    {/if}

    <!-- Rotation handle - orbits in AABB space, kept in DOM during rotation -->
    {#if isSelected && effectiveIsRotatable && rotationHandle}
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

    <!-- Inner div: rotated content area - holds content, resize handles, vertex handles -->
    <div
      {...effectiveIsDraggable && isSelected ? interactionHandles.dragProps : {}}
      use:doublePress={{ onDouble: guardedOnDoubleClick }}
      style:position="absolute"
      style:left="{innerLeft}px"
      style:top="{innerTop}px"
      style:width="{innerWidth}px"
      style:height="{innerHeight}px"
      style:transform={annotationRotation !== 0 ? `rotate(${annotationRotation}deg)` : undefined}
      style:transform-origin={innerTransformOrigin}
      style:outline={showOutline ? `${outlineWidth}px ${outlineStyleVal} ${outlineColor}` : 'none'}
      style:outline-offset={showOutline ? `${outlineOff}px` : '0px'}
      style:pointer-events={isSelected && !isMultiSelected ? 'auto' : 'none'}
      style:touch-action="none"
      style:cursor={isSelected && effectiveIsDraggable ? 'move' : 'default'}
    >
      <!-- Annotation content - renders in unrotated coordinate space -->
      {#if customAnnotationRenderer}
        {@render customAnnotationRenderer?.({
          annotation: childObject,
          children: children as Snippet,
          isSelected,
          scale,
          rotation,
          pageWidth,
          pageHeight,
          pageIndex,
          onSelect,
        })}
      {:else}
        {@render children(childObject)}
      {/if}

      <!-- Resize handles - rotate with the shape -->
      {#if isSelected && effectiveIsResizable && !rotationActive}
        {#each resizeHandles as { key, style: handleStyle, ...hProps } (key)}
          {#if resizeUI?.component}
            {@render resizeUI.component({ ...hProps, backgroundColor: HANDLE_COLOR })}
          {:else}
            <div {...hProps} style="{handleStyle}; background-color: {HANDLE_COLOR};"></div>
          {/if}
        {/each}
      {/if}

      <!-- Vertex handles - rotate with the shape -->
      {#if isSelected && permissions.canModifyAnnotations && !isMultiSelected && !rotationActive}
        {#each vertexHandles as { key, style: vertexStyle, ...vProps } (key)}
          {#if vertexUI?.component}
            {@render vertexUI.component({ ...vProps, backgroundColor: VERTEX_COLOR })}
          {:else}
            <div {...vProps} style="{vertexStyle}; background-color: {VERTEX_COLOR};"></div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <!-- Selection Menu: Supports BOTH render function and snippet - hide when multi-selected or rotating -->
  {#if shouldShowMenu}
    <CounterRotate
      rect={{
        origin: {
          x: currentObject.rect.origin.x * scale,
          y: currentObject.rect.origin.y * scale,
        },
        size: {
          width: currentObject.rect.size.width * scale,
          height: currentObject.rect.size.height * scale,
        },
      }}
      {rotation}
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

  <!-- Cursor-following rotation tooltip - portaled to document.body to escape CSS transform chain -->
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
</div>

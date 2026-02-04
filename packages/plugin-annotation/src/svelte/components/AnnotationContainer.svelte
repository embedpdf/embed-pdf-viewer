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
    selectionOutlineColor = '#007ACC',
    customAnnotationRenderer,
    ...restProps
  }: AnnotationContainerProps<T> = $props();

  let preview = $state<T>(trackedAnnotation.object);
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
  const HANDLE_SIZE = $derived(resizeUI?.size ?? 12);
  const VERTEX_SIZE = $derived(vertexUI?.size ?? 12);

  // Determine if we should show the outline
  // When multi-selected, don't show individual outlines - GroupSelectionBox shows the group outline
  const showOutline = $derived(isSelected && !isMultiSelected);

  // Sync preview with tracked annotation when it changes
  $effect(() => {
    if (trackedAnnotation.object) {
      preview = trackedAnnotation.object;
    }
  });

  // Subscribe to unified drag/resize changes - plugin sends pre-computed patches!
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
      const patch = event.previewPatches?.[id];
      if (event.type === 'update' && patch) {
        // Use untrack to prevent tracking the read of preview (like Vue's toRaw)
        preview = { ...untrack(() => preview), ...patch } as T;
      } else if (event.type === 'cancel') {
        preview = trackedAnnotation.object;
      }
    };

    const unsubs = [plugin.onDragChange(handleEvent), plugin.onResizeChange(handleEvent)];

    return () => unsubs.forEach((u) => u());
  });

  const interactionHandles = useInteractionHandles(() => ({
    controller: {
      element: currentObject.rect,
      vertices: vertexConfig?.extractVertices(currentObject),
      constraints: {
        minWidth: 10,
        minHeight: 10,
        boundingBox: { width: pageWidth, height: pageHeight },
      },
      maintainAspectRatio: lockAspectRatio,
      pageRotation: rotation,
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
          gestureBaseRectRef = trackedAnnotation.object.rect;
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
      spacing: outlineOffset,
      offsetMode: 'outside',
      includeSides: lockAspectRatio ? false : true,
      zIndex: zIndex + 1,
    },
    vertexUI: {
      vertexSize: VERTEX_SIZE,
      zIndex: zIndex + 2,
    },
    includeVertices: vertexConfig ? true : false,
  }));

  // Derived accessors for template
  const resizeHandles = $derived(interactionHandles.resize);
  const vertexHandles = $derived(interactionHandles.vertices);

  // --- Selection Menu Logic ---

  // Check if we should show menu - hide when multi-selected
  const shouldShowMenu = $derived(
    isSelected && !isMultiSelected && (!!selectionMenu || !!selectionMenuSnippet),
  );

  // Build context object for selection menu
  function buildContext(): AnnotationSelectionContext {
    return {
      type: 'annotation',
      annotation: trackedAnnotation,
      pageIndex,
    };
  }

  // Placement hints
  const menuPlacement: SelectionMenuPlacement = {
    suggestTop: false,
    spaceAbove: 0,
    spaceBelow: 0,
  };

  // Build menu props
  function buildMenuProps(
    rect: Rect,
    menuWrapperProps: MenuWrapperProps,
  ): AnnotationSelectionMenuProps {
    return {
      context: buildContext(),
      selected: isSelected,
      rect,
      placement: menuPlacement,
      menuWrapperProps,
    };
  }
</script>

<div data-no-interaction>
  <div
    {...effectiveIsDraggable && isSelected ? interactionHandles.dragProps : {}}
    use:doublePress={{ onDouble: guardedOnDoubleClick }}
    style:position="absolute"
    style:left="{currentObject.rect.origin.x * scale}px"
    style:top="{currentObject.rect.origin.y * scale}px"
    style:width="{currentObject.rect.size.width * scale}px"
    style:height="{currentObject.rect.size.height * scale}px"
    style:outline={showOutline ? `1px solid ${selectionOutlineColor}` : 'none'}
    style:outline-offset={showOutline ? `${outlineOffset}px` : '0px'}
    style:pointer-events={isSelected && !isMultiSelected ? 'auto' : 'none'}
    style:touch-action="none"
    style:cursor={isSelected && effectiveIsDraggable ? 'move' : 'default'}
    style:z-index={zIndex}
    style={style || ''}
    class={propsClass}
    {...restProps}
  >
    {#if customAnnotationRenderer}
      {@render customAnnotationRenderer?.({
        annotation: currentObject,
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
      {@render children(currentObject)}
    {/if}

    <!-- Resize handles - only when single-selected -->
    {#if isSelected && effectiveIsResizable}
      {#each resizeHandles as { key, style: handleStyle, ...hProps } (key)}
        {#if resizeUI?.component}
          {@const Component = resizeUI.component}
          <Component {...hProps} backgroundColor={HANDLE_COLOR} />
        {:else}
          <div {...hProps} style="{handleStyle}; background-color: {HANDLE_COLOR};"></div>
        {/if}
      {/each}
    {/if}

    <!-- Vertex handles - only when single-selected -->
    {#if isSelected && permissions.canModifyAnnotations && !isMultiSelected}
      {#each vertexHandles as { key, style: vertexStyle, ...vProps } (key)}
        {#if vertexUI?.component}
          {@const Component = vertexUI.component}
          <Component {...vProps} backgroundColor={VERTEX_COLOR} />
        {:else}
          <div {...vProps} style="{vertexStyle}; background-color: {VERTEX_COLOR};"></div>
        {/if}
      {/each}
    {/if}
  </div>

  <!-- Selection Menu: Supports BOTH render function and snippet - hide when multi-selected -->
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
</div>

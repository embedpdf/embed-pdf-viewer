<script lang="ts" generics="T extends PdfAnnotationObject">
  import type { PdfAnnotationObject, Rect } from '@embedpdf/models';
  import { useDocumentPermissions } from '@embedpdf/core/svelte';
  import { useAnnotationCapability } from '../hooks';
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
    zIndex = 20,
    resizeUI,
    vertexUI,
    selectionOutlineColor = '#007ACC',
    customAnnotationRenderer,
    ...restProps
  }: AnnotationContainerProps<T> = $props();

  let preview = $state<T>(trackedAnnotation.object);
  let annotationCapability = useAnnotationCapability();
  const permissions = useDocumentPermissions(() => documentId);
  let gestureBaseRef = $state<T | null>(null);

  // Override props based on permission
  const effectiveIsDraggable = $derived(permissions.canModifyAnnotations && isDraggable);
  const effectiveIsResizable = $derived(permissions.canModifyAnnotations && isResizable);

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

  // Defaults retain current behavior
  const HANDLE_COLOR = $derived(resizeUI?.color ?? '#007ACC');
  const VERTEX_COLOR = $derived(vertexUI?.color ?? '#007ACC');
  const HANDLE_SIZE = $derived(resizeUI?.size ?? 12);
  const VERTEX_SIZE = $derived(vertexUI?.size ?? 12);

  $effect(() => {
    if (trackedAnnotation.object) {
      preview = trackedAnnotation.object;
    }
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
      enabled: isSelected,
      onUpdate: (event) => {
        if (!event.transformData?.type) return;

        if (event.state === 'start') {
          gestureBaseRef = currentObject;
        }

        const transformType = event.transformData.type;
        const base = gestureBaseRef ?? currentObject;

        const changes = event.transformData.changes.vertices
          ? vertexConfig?.transformAnnotation(base, event.transformData.changes.vertices)
          : { rect: event.transformData.changes.rect };

        const patched = annotationCapability.provides?.transformAnnotation<T>(base, {
          type: transformType,
          changes: changes as Partial<T>,
          metadata: event.transformData.metadata,
        });

        if (patched) {
          preview = {
            ...preview,
            ...patched,
          };
        }
        if (event.state === 'end' && patched) {
          gestureBaseRef = null;
          // Sanitize to remove Svelte reactive properties before updating
          // Use deepToRaw to recursively strip proxies while preserving complex objects
          const sanitized = deepToRaw(patched);
          annotationProvides?.updateAnnotation(pageIndex, trackedAnnotation.object.id, sanitized);
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

  // Check if we should show menu
  const shouldShowMenu = $derived(isSelected && (!!selectionMenu || !!selectionMenuSnippet));

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
    style:outline={isSelected ? `1px solid ${selectionOutlineColor}` : 'none'}
    style:outline-offset={isSelected ? `${outlineOffset}px` : '0px'}
    style:pointer-events={isSelected ? 'auto' : 'none'}
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

    {#if isSelected && permissions.canModifyAnnotations}
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

  <!-- Selection Menu: Supports BOTH render function and snippet -->
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

<script lang="ts" generics="T extends PdfAnnotationObject">
  import { type TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import { type Snippet } from 'svelte';
  import { useAnnotationCapability } from '../hooks';
  import type { VertexConfig } from '../../shared/types';
  import type {
    CustomAnnotationRenderer,
    ResizeHandleUI,
    SelectionMenuProps,
    VertexHandleUI,
  } from '../types';
  import {
    useInteractionHandles,
    doublePress,
    CounterRotate,
    deepToRaw,
  } from '@embedpdf/utils/svelte';

  interface AnnotationContainerProps {
    scale: number;
    pageIndex: number;
    rotation: number;
    pageWidth: number;
    pageHeight: number;
    trackedAnnotation: TrackedAnnotation<T>;
    children: Snippet<[T]>;
    isSelected: boolean;
    isDraggable: boolean;
    isResizable: boolean;
    lockAspectRatio?: boolean;
    class?: string;
    style?: Record<string, string | number | undefined>;
    vertexConfig?: VertexConfig<T>;
    selectionMenu?: Snippet<[SelectionMenuProps]>;
    outlineOffset?: number;
    onDoubleClick?: (event: any) => void;
    onSelect: (event: any) => void;
    zIndex?: number;
    resizeUI?: ResizeHandleUI;
    vertexUI?: VertexHandleUI;
    selectionOutlineColor?: string;
    customAnnotationRenderer?: CustomAnnotationRenderer<T>;
  }

  let {
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
    outlineOffset = 1,
    onDoubleClick,
    onSelect,
    zIndex = 20,
    resizeUI,
    vertexUI,
    selectionOutlineColor = '#007ACC',
    customAnnotationRenderer,
    ...restProps
  }: AnnotationContainerProps = $props();

  let preview = $state<T>(trackedAnnotation.object);
  let annotationCapability = useAnnotationCapability();
  let gestureBaseRef = $state<T | null>(null);

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

  const interactionHandles = useInteractionHandles({
    controller: {
      element: currentObject.rect,
      vertices: vertexConfig?.extractVertices(currentObject),
      constraints: {
        minWidth: 10,
        minHeight: 10,
        boundingBox: { width: pageWidth / scale, height: pageHeight / scale },
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
          annotationCapability.provides?.updateAnnotation(
            pageIndex,
            trackedAnnotation.object.id,
            sanitized,
          );
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
  });

  // Derived accessors for template
  const resizeHandles = $derived(interactionHandles.resize);
  const vertexHandles = $derived(interactionHandles.vertices);
</script>

<div data-no-interaction>
  <div
    {...isDraggable && isSelected ? interactionHandles.dragProps : {}}
    use:doublePress={{ onDouble: onDoubleClick }}
    style:position="absolute"
    style:left="{currentObject.rect.origin.x * scale}px"
    style:top="{currentObject.rect.origin.y * scale}px"
    style:width="{currentObject.rect.size.width * scale}px"
    style:height="{currentObject.rect.size.height * scale}px"
    style:outline={isSelected ? `1px solid ${selectionOutlineColor}` : 'none'}
    style:outline-offset={isSelected ? `${outlineOffset}px` : '0px'}
    style:pointer-events={isSelected ? 'auto' : 'none'}
    style:touch-action="none"
    style:cursor={isSelected && isDraggable ? 'move' : 'default'}
    style:z-index={zIndex}
    {...style ? Object.fromEntries(Object.entries(style).map(([k, v]) => [`style:${k}`, v])) : {}}
    class={propsClass}
    {...restProps}
  >
    {#if customAnnotationRenderer}
      {@render customAnnotationRenderer?.({
        annotation: currentObject,
        children,
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

    {#if isSelected && isResizable}
      {#each resizeHandles as { key, ...hProps } (key)}
        {#if resizeUI?.component}
          {@const Component = resizeUI.component}
          <Component {...hProps} backgroundColor={HANDLE_COLOR} />
        {:else}
          <div {...hProps} style:background-color={HANDLE_COLOR}></div>
        {/if}
      {/each}
    {/if}

    {#if isSelected}
      {#each vertexHandles as { key, ...vProps } (key)}
        {#if vertexUI?.component}
          {@const Component = vertexUI.component}
          <Component {...vProps} backgroundColor={VERTEX_COLOR} />
        {:else}
          <div {...vProps} style:background-color={VERTEX_COLOR}></div>
        {/if}
      {/each}
    {/if}
  </div>

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
      {#if selectionMenu}
        {@render selectionMenu({
          annotation: trackedAnnotation,
          selected: isSelected,
          rect,
          menuWrapperProps,
        })}
      {/if}
    {/snippet}
  </CounterRotate>
</div>

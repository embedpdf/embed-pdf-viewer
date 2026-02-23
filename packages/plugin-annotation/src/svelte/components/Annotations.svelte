<!-- Annotations.svelte -->
<script lang="ts">
  import {
    blendModeToCss,
    type PdfAnnotationObject,
    PdfBlendMode,
    type AnnotationAppearanceMap,
    type AnnotationAppearances,
  } from '@embedpdf/models';
  import {
    getAnnotationsByPageIndex,
    getSelectedAnnotationIds,
    type TrackedAnnotation,
    resolveInteractionProp,
  } from '@embedpdf/plugin-annotation';

  import {
    type PointerEventHandlersWithLifecycle,
    type EmbedPdfPointerEvent,
  } from '@embedpdf/plugin-interaction-manager';
  import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/svelte';
  import { useSelectionCapability } from '@embedpdf/plugin-selection/svelte';

  import { useAnnotationCapability } from '../hooks';
  import type {
    BoxedAnnotationRenderer,
    AnnotationInteractionEvent,
    SelectOverrideHelpers,
  } from '../context';

  import GroupSelectionBox from './GroupSelectionBox.svelte';
  import type {
    AnnotationSelectionMenuProps,
    AnnotationSelectionMenuRenderFn,
    GroupSelectionMenuProps,
    GroupSelectionMenuRenderFn,
    CustomAnnotationRenderer,
    ResizeHandleUI,
    VertexHandleUI,
    RotationHandleUI,
    SelectionOutline,
  } from '../types';
  import AnnotationContainer from './AnnotationContainer.svelte';
  import type { Snippet } from 'svelte';
  import { builtInRenderers } from './built-in-renderers';

  // ---------- props ----------
  interface AnnotationsProps {
    documentId: string;
    pageIndex: number;
    scale: number;
    rotation: number;
    pageWidth: number;
    pageHeight: number;
    selectionMenu?: AnnotationSelectionMenuRenderFn;
    selectionMenuSnippet?: Snippet<[AnnotationSelectionMenuProps]>;
    groupSelectionMenu?: GroupSelectionMenuRenderFn;
    groupSelectionMenuSnippet?: Snippet<[GroupSelectionMenuProps]>;
    resizeUI?: ResizeHandleUI;
    vertexUI?: VertexHandleUI;
    rotationUI?: RotationHandleUI;
    /** @deprecated Use `selectionOutline` instead */
    selectionOutlineColor?: string;
    selectionOutline?: SelectionOutline;
    groupSelectionOutline?: SelectionOutline;
    customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
    annotationRenderers?: BoxedAnnotationRenderer[];
  }
  let annotationsProps: AnnotationsProps = $props();

  // ---------- capabilities / handlers ----------
  const annotationCapability = useAnnotationCapability();
  const selectionCapability = useSelectionCapability();
  const pointerHandlers = usePointerHandlers({
    documentId: annotationsProps.documentId,
    pageIndex: annotationsProps.pageIndex,
  });

  // ---------- local state ----------
  let annotations = $state<TrackedAnnotation[]>([]);
  let allSelectedIds = $state<string[]>([]);
  let editingId = $state<string | null>(null);
  let appearanceMap = $state<AnnotationAppearanceMap>({});
  let prevScale: number = annotationsProps.scale;

  const annotationProvides = $derived(
    annotationCapability.provides
      ? annotationCapability.provides.forDocument(annotationsProps.documentId)
      : null,
  );

  const isMultiSelected = $derived(allSelectedIds.length > 1);

  // Merge renderers: external renderers override built-ins by ID
  const allRenderers = $derived.by(() => {
    const external = annotationsProps.annotationRenderers ?? [];
    const externalIds = new Set(external.map((r) => r.id));
    return [...external, ...builtInRenderers.filter((r) => !externalIds.has(r.id))];
  });

  function resolveRenderer(annotation: TrackedAnnotation): BoxedAnnotationRenderer | null {
    return allRenderers.find((r) => r.matches(annotation.object)) ?? null;
  }

  function getAppearanceForAnnotation(ta: TrackedAnnotation): AnnotationAppearances | null {
    if (ta.dictMode) return null;
    if (ta.object.rotation && ta.object.unrotatedRect) return null;
    const appearances = appearanceMap[ta.object.id];
    if (!appearances?.normal) return null;
    return appearances;
  }

  // Subscribe to annotation state
  $effect(() => {
    if (!annotationProvides) return;

    const currentState = annotationProvides.getState();
    annotations = getAnnotationsByPageIndex(currentState, annotationsProps.pageIndex);
    allSelectedIds = getSelectedAnnotationIds(currentState);

    const off = annotationProvides.onStateChange((state) => {
      annotations = getAnnotationsByPageIndex(state, annotationsProps.pageIndex);
      allSelectedIds = getSelectedAnnotationIds(state);
    });
    return () => off?.();
  });

  // Fetch appearance map, invalidate on scale change
  $effect(() => {
    if (!annotationProvides) return;

    if (prevScale !== annotationsProps.scale) {
      annotationProvides.invalidatePageAppearances(annotationsProps.pageIndex);
      prevScale = annotationsProps.scale;
    }

    const task = annotationProvides.getPageAppearances(annotationsProps.pageIndex, {
      scaleFactor: annotationsProps.scale,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    });
    task.wait(
      (map) => (appearanceMap = map),
      () => (appearanceMap = {}),
    );
  });

  // Pointer handlers
  const handlers: PointerEventHandlersWithLifecycle<EmbedPdfPointerEvent<PointerEvent>> = {
    onPointerDown: (_, pe) => {
      if (pe.target === pe.currentTarget && annotationProvides) {
        annotationProvides.deselectAnnotation();
        editingId = null;
      }
    },
  };

  $effect(() => {
    return pointerHandlers.register(handlers, { documentId: annotationsProps.documentId });
  });

  function handleClick(e: AnnotationInteractionEvent, annotation: TrackedAnnotation) {
    e.stopPropagation();
    if (annotationProvides && selectionCapability.provides) {
      selectionCapability.provides.clear();

      const isModifierPressed = 'metaKey' in e ? e.metaKey || e.ctrlKey : false;

      if (isModifierPressed) {
        annotationProvides.toggleSelection(annotationsProps.pageIndex, annotation.object.id);
      } else {
        annotationProvides.selectAnnotation(annotationsProps.pageIndex, annotation.object.id);
      }

      if (annotation.object.id !== editingId) {
        editingId = null;
      }
    }
  }

  function setEditingId(id: string) {
    editingId = id;
  }

  const selectedAnnotationsOnPage = $derived(
    annotations.filter((anno) => allSelectedIds.includes(anno.object.id)),
  );

  const areAllSelectedDraggable = $derived.by(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      const groupDraggable = resolveInteractionProp(
        tool?.interaction.isGroupDraggable,
        ta.object,
        true,
      );
      const singleDraggable = resolveInteractionProp(
        tool?.interaction.isDraggable,
        ta.object,
        true,
      );
      return tool?.interaction.isGroupDraggable !== undefined ? groupDraggable : singleDraggable;
    });
  });

  const areAllSelectedResizable = $derived.by(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      const groupResizable = resolveInteractionProp(
        tool?.interaction.isGroupResizable,
        ta.object,
        true,
      );
      const singleResizable = resolveInteractionProp(
        tool?.interaction.isResizable,
        ta.object,
        true,
      );
      return tool?.interaction.isGroupResizable !== undefined ? groupResizable : singleResizable;
    });
  });

  const areAllSelectedRotatable = $derived.by(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      const groupRotatable = resolveInteractionProp(
        tool?.interaction.isGroupRotatable,
        ta.object,
        true,
      );
      const singleRotatable = resolveInteractionProp(
        tool?.interaction.isRotatable,
        ta.object,
        true,
      );
      return tool?.interaction.isGroupRotatable !== undefined ? groupRotatable : singleRotatable;
    });
  });

  const shouldLockGroupAspectRatio = $derived.by(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.some((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      const groupLock = resolveInteractionProp(
        tool?.interaction.lockGroupAspectRatio,
        ta.object,
        false,
      );
      const singleLock = resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        ta.object,
        false,
      );
      return tool?.interaction.lockGroupAspectRatio !== undefined ? groupLock : singleLock;
    });
  });

  const allSelectedOnSamePage = $derived.by(() => {
    if (!annotationProvides) return false;
    if (allSelectedIds.length < 2) return false;
    const allSelected = annotationProvides.getSelectedAnnotations();
    return allSelected.every((ta) => ta.object.pageIndex === annotationsProps.pageIndex);
  });
</script>

{#each annotations as annotation (annotation.object.id)}
  {@const renderer = resolveRenderer(annotation)}
  {#if renderer}
    {@const isSelected = allSelectedIds.includes(annotation.object.id)}
    {@const isEditing = editingId === annotation.object.id}
    {@const tool = annotationProvides?.findToolForAnnotation(annotation.object)}
    {@const defaults = renderer.interactionDefaults}
    {@const resolvedDraggable = resolveInteractionProp(
      tool?.interaction.isDraggable,
      annotation.object,
      defaults?.isDraggable ?? true,
    )}
    {@const finalDraggable = renderer.isDraggable
      ? renderer.isDraggable(resolvedDraggable, { isEditing })
      : resolvedDraggable}
    {@const useAP = tool?.behavior?.useAppearanceStream ?? renderer.useAppearanceStream ?? true}
    {@const selectHelpers = {
      defaultSelect: handleClick,
      selectAnnotation: (pi: number, id: string) => annotationProvides?.selectAnnotation(pi, id),
      clearSelection: () => selectionCapability.provides?.clear(),
      allAnnotations: annotations,
      pageIndex: annotationsProps.pageIndex,
    }}
    {@const onSelect = renderer.selectOverride
      ? (e: AnnotationInteractionEvent) => renderer.selectOverride!(e, annotation, selectHelpers)
      : (e: AnnotationInteractionEvent) => handleClick(e, annotation)}
    {@const RendererComponent = renderer.component}

    <AnnotationContainer
      trackedAnnotation={annotation}
      {isSelected}
      {isEditing}
      {isMultiSelected}
      isDraggable={finalDraggable}
      isResizable={resolveInteractionProp(
        tool?.interaction.isResizable,
        annotation.object,
        defaults?.isResizable ?? false,
      )}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        defaults?.lockAspectRatio ?? false,
      )}
      isRotatable={resolveInteractionProp(
        tool?.interaction.isRotatable,
        annotation.object,
        defaults?.isRotatable ?? false,
      )}
      vertexConfig={renderer.vertexConfig}
      selectionMenu={renderer.hideSelectionMenu?.(annotation.object)
        ? undefined
        : isMultiSelected
          ? undefined
          : annotationsProps.selectionMenu}
      selectionMenuSnippet={renderer.hideSelectionMenu?.(annotation.object)
        ? undefined
        : isMultiSelected
          ? undefined
          : annotationsProps.selectionMenuSnippet}
      {onSelect}
      onDoubleClick={renderer.onDoubleClick
        ? (e) => {
            e.stopPropagation();
            renderer.onDoubleClick!(annotation.object.id, setEditingId);
          }
        : undefined}
      zIndex={renderer.zIndex}
      style={renderer.containerStyle?.(annotation.object) ??
        `mix-blend-mode: ${blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal)}`}
      appearance={useAP ? getAppearanceForAnnotation(annotation) : undefined}
      {...annotationsProps}
    >
      {#snippet children(currentObject, { appearanceActive })}
        <RendererComponent
          {annotation}
          {currentObject}
          {isSelected}
          {isEditing}
          scale={annotationsProps.scale}
          pageIndex={annotationsProps.pageIndex}
          documentId={annotationsProps.documentId}
          onClick={onSelect}
          {appearanceActive}
        />
      {/snippet}
    </AnnotationContainer>
  {/if}
{/each}

<!-- Group Selection Box -->
{#if allSelectedOnSamePage && selectedAnnotationsOnPage.length >= 2}
  <GroupSelectionBox
    documentId={annotationsProps.documentId}
    pageIndex={annotationsProps.pageIndex}
    scale={annotationsProps.scale}
    rotation={annotationsProps.rotation}
    pageWidth={annotationsProps.pageWidth}
    pageHeight={annotationsProps.pageHeight}
    selectedAnnotations={selectedAnnotationsOnPage}
    isDraggable={areAllSelectedDraggable}
    isResizable={areAllSelectedResizable}
    isRotatable={areAllSelectedRotatable}
    lockAspectRatio={shouldLockGroupAspectRatio}
    resizeUI={annotationsProps.resizeUI}
    rotationUI={annotationsProps.rotationUI}
    selectionOutlineColor={annotationsProps.selectionOutlineColor}
    selectionOutline={annotationsProps.groupSelectionOutline ?? annotationsProps.selectionOutline}
    groupSelectionMenu={annotationsProps.groupSelectionMenu}
    groupSelectionMenuSnippet={annotationsProps.groupSelectionMenuSnippet}
  />
{/if}

<!-- Annotations.svelte -->
<script lang="ts">
  import { blendModeToCss, type PdfAnnotationObject, PdfBlendMode } from '@embedpdf/models';
  import {
    getAnnotationsByPageIndex,
    getSelectedAnnotationIds,
    isCircle,
    isFreeText,
    isHighlight,
    isInk,
    isLine,
    isLink,
    isPolygon,
    isPolyline,
    isSquare,
    isSquiggly,
    isStamp,
    isStrikeout,
    isUnderline,
    type TrackedAnnotation,
    resolveInteractionProp,
  } from '@embedpdf/plugin-annotation';
  import type { PdfLinkAnnoObject } from '@embedpdf/models';

  import {
    type PointerEventHandlersWithLifecycle,
    type EmbedPdfPointerEvent,
  } from '@embedpdf/plugin-interaction-manager';
  import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/svelte';
  import { useSelectionCapability } from '@embedpdf/plugin-selection/svelte';

  import { useAnnotationCapability } from '../hooks';

  import Highlight from './text-markup/Highlight.svelte';
  import Underline from './text-markup/Underline.svelte';
  import Strikeout from './text-markup/Strikeout.svelte';
  import Squiggly from './text-markup/Squiggly.svelte';
  import Ink from './annotations/Ink.svelte';
  import Square from './annotations/Square.svelte';
  import Circle from './annotations/Circle.svelte';
  import Line from './annotations/Line.svelte';
  import Polyline from './annotations/Polyline.svelte';
  import Polygon from './annotations/Polygon.svelte';
  import FreeText from './annotations/FreeText.svelte';
  import Stamp from './annotations/Stamp.svelte';
  import Link from './annotations/Link.svelte';
  import GroupSelectionBox from './GroupSelectionBox.svelte';
  import type {
    AnnotationSelectionMenuProps,
    AnnotationSelectionMenuRenderFn,
    GroupSelectionMenuProps,
    GroupSelectionMenuRenderFn,
    CustomAnnotationRenderer,
    ResizeHandleUI,
    VertexHandleUI,
  } from '../types';
  import AnnotationContainer from './AnnotationContainer.svelte';
  import type { Snippet } from 'svelte';

  // ---------- props ----------
  interface AnnotationsProps {
    documentId: string;
    pageIndex: number;
    scale: number;
    rotation: number;
    pageWidth: number;
    pageHeight: number;
    /** Render function for selection menu (schema-driven approach) */
    selectionMenu?: AnnotationSelectionMenuRenderFn;
    /** Snippet for custom selection menu (slot-based approach) */
    selectionMenuSnippet?: Snippet<[AnnotationSelectionMenuProps]>;
    /** Render function for group selection menu (schema-driven approach) */
    groupSelectionMenu?: GroupSelectionMenuRenderFn;
    /** Snippet for custom group selection menu (slot-based approach) */
    groupSelectionMenuSnippet?: Snippet<[GroupSelectionMenuProps]>;
    resizeUI?: ResizeHandleUI;
    vertexUI?: VertexHandleUI;
    selectionOutlineColor?: string;
    customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
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

  // Get scoped API for this document
  const annotationProvides = $derived(
    annotationCapability.provides
      ? annotationCapability.provides.forDocument(annotationsProps.documentId)
      : null,
  );

  // Check if multiple annotations are selected
  const isMultiSelected = $derived(allSelectedIds.length > 1);

  // subscribe to annotation state
  $effect(() => {
    if (!annotationProvides) return;

    // Initialize with current state immediately
    const currentState = annotationProvides.getState();
    annotations = getAnnotationsByPageIndex(currentState, annotationsProps.pageIndex);
    allSelectedIds = getSelectedAnnotationIds(currentState);

    // Then subscribe to changes
    const off = annotationProvides.onStateChange((state) => {
      annotations = getAnnotationsByPageIndex(state, annotationsProps.pageIndex);
      allSelectedIds = getSelectedAnnotationIds(state);
    });
    return () => off?.();
  });

  // pointer handlers (capture-down to deselect when clicking empty layer)
  const handlers: PointerEventHandlersWithLifecycle<EmbedPdfPointerEvent<PointerEvent>> = {
    onPointerDown: (_, pe) => {
      if (pe.target === pe.currentTarget && annotationProvides) {
        annotationProvides.deselectAnnotation();
        editingId = null;
      }
    },
  };

  // register pointer handlers
  $effect(() => {
    return pointerHandlers.register(handlers, { documentId: annotationsProps.documentId });
  });

  // click/select logic shared across shapes
  function handleClick(e: MouseEvent | TouchEvent, annotation: TrackedAnnotation) {
    e.stopPropagation();
    if (annotationProvides && selectionCapability.provides) {
      selectionCapability.provides.clear();

      // Check for modifier key (Cmd on Mac, Ctrl on Windows/Linux)
      const isModifierPressed = 'metaKey' in e ? e.metaKey || e.ctrlKey : false;

      if (isModifierPressed) {
        // Toggle selection: add or remove from current selection
        annotationProvides.toggleSelection(annotationsProps.pageIndex, annotation.object.id);
      } else {
        // Exclusive select: clear and select only this one
        annotationProvides.selectAnnotation(annotationsProps.pageIndex, annotation.object.id);
      }

      if (annotation.object.id !== editingId) {
        editingId = null;
      }
    }
  }

  // Special handler for link annotations - if IRT exists, select the parent
  function handleLinkClick(
    e: MouseEvent | TouchEvent,
    annotation: TrackedAnnotation<PdfLinkAnnoObject>,
  ) {
    e.stopPropagation();
    if (!annotationProvides || !selectionCapability.provides) return;

    selectionCapability.provides.clear();

    // If link has IRT, select the parent annotation instead
    if (annotation.object.inReplyToId) {
      const parentId = annotation.object.inReplyToId;
      const parent = annotations.find((a) => a.object.id === parentId);
      if (parent) {
        annotationProvides.selectAnnotation(parent.object.pageIndex, parentId);
        return;
      }
    }

    // Standalone link - select it directly
    annotationProvides.selectAnnotation(annotationsProps.pageIndex, annotation.object.id);
  }

  // Get selected annotations that are on THIS page (for group selection box)
  const selectedAnnotationsOnPage = $derived(
    annotations.filter((anno) => allSelectedIds.includes(anno.object.id)),
  );

  // Check if all selected annotations on this page are draggable in group context
  const areAllSelectedDraggable = $derived.by(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      // Use group-specific property, falling back to single-annotation property
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

  // Check if all selected annotations on this page are resizable in group context
  const areAllSelectedResizable = $derived.by(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      // Use group-specific property, falling back to single-annotation property
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

  // Check if all selected annotations are on the same page (this page)
  const allSelectedOnSamePage = $derived.by(() => {
    if (!annotationProvides) return false;
    // Early return if not enough selections (also creates reactive dependency on allSelectedIds)
    if (allSelectedIds.length < 2) return false;
    const allSelected = annotationProvides.getSelectedAnnotations();
    return allSelected.every((ta) => ta.object.pageIndex === annotationsProps.pageIndex);
  });
</script>

{#each annotations as annotation (annotation.object.id)}
  {@const isSelected = allSelectedIds.includes(annotation.object.id)}
  {@const isEditing = editingId === annotation.object.id}
  {@const tool = annotationProvides?.findToolForAnnotation(annotation.object)}
  {@const mixBlendMode = blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal)}

  {#if isInk(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(tool?.interaction.isDraggable, annotation.object, true) &&
        !isMultiSelected}
      isResizable={resolveInteractionProp(tool?.interaction.isResizable, annotation.object, true) &&
        !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e) => handleClick(e, annotation)}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Ink
          {...obj}
          {isSelected}
          scale={annotationsProps.scale}
          onClick={(e) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isSquare(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(tool?.interaction.isDraggable, annotation.object, true) &&
        !isMultiSelected}
      isResizable={resolveInteractionProp(tool?.interaction.isResizable, annotation.object, true) &&
        !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Square
          {...obj}
          {isSelected}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isCircle(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(tool?.interaction.isDraggable, annotation.object, true) &&
        !isMultiSelected}
      isResizable={resolveInteractionProp(tool?.interaction.isResizable, annotation.object, true) &&
        !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Circle
          {...obj}
          {isSelected}
          scale={annotationsProps.scale}
          onClick={(e: PointerEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isUnderline(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(
        tool?.interaction.isDraggable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      isResizable={resolveInteractionProp(
        tool?.interaction.isResizable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      zIndex={0}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Underline
          {...obj}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isStrikeout(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(
        tool?.interaction.isDraggable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      isResizable={resolveInteractionProp(
        tool?.interaction.isResizable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      zIndex={0}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Strikeout
          {...obj}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isSquiggly(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(
        tool?.interaction.isDraggable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      isResizable={resolveInteractionProp(
        tool?.interaction.isResizable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      zIndex={0}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Squiggly
          {...obj}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isHighlight(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(
        tool?.interaction.isDraggable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      isResizable={resolveInteractionProp(
        tool?.interaction.isResizable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      zIndex={0}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      style="mix-blend-mode: {blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Multiply)}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Highlight
          {...obj}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isLine(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(tool?.interaction.isDraggable, annotation.object, true) &&
        !isMultiSelected}
      isResizable={resolveInteractionProp(
        tool?.interaction.isResizable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      vertexConfig={{
        extractVertices: (a) => [a.linePoints.start, a.linePoints.end],
        transformAnnotation: (a, vertices) => ({
          ...a,
          linePoints: { start: vertices[0], end: vertices[1] },
        }),
      }}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Line
          {...obj}
          {isSelected}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isPolyline(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      isDraggable={resolveInteractionProp(tool?.interaction.isDraggable, annotation.object, true) &&
        !isMultiSelected}
      isResizable={resolveInteractionProp(
        tool?.interaction.isResizable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      isSelected={isSelected && !isMultiSelected}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      vertexConfig={{
        extractVertices: (a) => a.vertices,
        transformAnnotation: (a, vertices) => ({ ...a, vertices }),
      }}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Polyline
          {...obj}
          {isSelected}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isPolygon(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(tool?.interaction.isDraggable, annotation.object, true) &&
        !isMultiSelected}
      isResizable={resolveInteractionProp(
        tool?.interaction.isResizable,
        annotation.object,
        false,
      ) && !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      vertexConfig={{
        extractVertices: (a) => a.vertices,
        transformAnnotation: (a, vertices) => ({ ...a, vertices }),
      }}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Polygon
          {...obj}
          {isSelected}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isFreeText(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(tool?.interaction.isDraggable, annotation.object, true) &&
        !isEditing &&
        !isMultiSelected}
      isResizable={resolveInteractionProp(tool?.interaction.isResizable, annotation.object, true) &&
        !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e) => handleClick(e, annotation)}
      style="mix-blend-mode: {blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal)}"
      onDoubleClick={(e) => {
        e.stopPropagation();
        editingId = annotation.object.id;
      }}
      {...annotationsProps}
    >
      {#snippet children(object)}
        <FreeText
          documentId={annotationsProps.documentId}
          {isSelected}
          {isEditing}
          annotation={{ ...annotation, object }}
          pageIndex={annotationsProps.pageIndex}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isStamp(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      isDraggable={resolveInteractionProp(tool?.interaction.isDraggable, annotation.object, true) &&
        !isMultiSelected}
      isResizable={resolveInteractionProp(tool?.interaction.isResizable, annotation.object, true) &&
        !isMultiSelected}
      lockAspectRatio={resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        annotation.object,
        false,
      )}
      selectionMenu={isMultiSelected ? undefined : annotationsProps.selectionMenu}
      selectionMenuSnippet={isMultiSelected ? undefined : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(_object)}
        <Stamp
          documentId={annotationsProps.documentId}
          {isSelected}
          {annotation}
          pageIndex={annotationsProps.pageIndex}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
        />
      {/snippet}
    </AnnotationContainer>
  {:else if isLink(annotation)}
    {@const hasIRT = !!annotation.object.inReplyToId}
    <AnnotationContainer
      trackedAnnotation={annotation}
      isSelected={isSelected && !isMultiSelected}
      {isMultiSelected}
      isDraggable={false}
      isResizable={false}
      lockAspectRatio={false}
      selectionMenu={hasIRT
        ? undefined
        : isMultiSelected
          ? undefined
          : annotationsProps.selectionMenu}
      selectionMenuSnippet={hasIRT
        ? undefined
        : isMultiSelected
          ? undefined
          : annotationsProps.selectionMenuSnippet}
      onSelect={(e: MouseEvent | TouchEvent) => handleLinkClick(e, annotation)}
      style="mix-blend-mode: {mixBlendMode}"
      {...annotationsProps}
    >
      {#snippet children(obj)}
        <Link
          {...obj}
          {isSelected}
          scale={annotationsProps.scale}
          onClick={(e: MouseEvent | TouchEvent) => handleLinkClick(e, annotation)}
          {hasIRT}
        />
      {/snippet}
    </AnnotationContainer>
  {/if}
{/each}

<!-- Group Selection Box (shown when multiple annotations are selected on this page) -->
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
    resizeUI={annotationsProps.resizeUI}
    selectionOutlineColor={annotationsProps.selectionOutlineColor}
    groupSelectionMenu={annotationsProps.groupSelectionMenu}
    groupSelectionMenuSnippet={annotationsProps.groupSelectionMenuSnippet}
  />
{/if}

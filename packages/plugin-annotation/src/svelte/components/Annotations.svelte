<!-- Annotations.svelte -->
<script lang="ts">
  import { blendModeToCss, type PdfAnnotationObject, PdfBlendMode } from '@embedpdf/models';
  import {
    getAnnotationsByPageIndex,
    getSelectedAnnotationByPageIndex,
    isCircle,
    isFreeText,
    isHighlight,
    isInk,
    isLine,
    isPolygon,
    isPolyline,
    isSquare,
    isSquiggly,
    isStamp,
    isStrikeout,
    isUnderline,
    type TrackedAnnotation,
  } from '@embedpdf/plugin-annotation';

  import { type PointerEventHandlersWithLifecycle } from '@embedpdf/plugin-interaction-manager';
  import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/svelte';
  import { useSelectionCapability } from '@embedpdf/plugin-selection/svelte';

  import { useAnnotationCapability } from '../hooks';
  import { useCoreState } from '@embedpdf/core/svelte';

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
  import type {
    AnnotationSelectionMenuProps,
    AnnotationSelectionMenuRenderFn,
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
    resizeUI?: ResizeHandleUI;
    vertexUI?: VertexHandleUI;
    selectionOutlineColor?: string;
    customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
  }
  let annotationsProps: AnnotationsProps = $props();

  // ---------- capabilities / handlers ----------
  const annotationCapability = useAnnotationCapability();
  const selectionCapability = useSelectionCapability();
  const coreStateRef = useCoreState();
  const pointerHandlers = usePointerHandlers({
    documentId: annotationsProps.documentId,
    pageIndex: annotationsProps.pageIndex,
  });

  // Check if document is read-only
  const isReadOnly = $derived(
    coreStateRef.current?.documents[annotationsProps.documentId]?.readOnly === true,
  );

  // ---------- local state ----------
  let annotations = $state<TrackedAnnotation[]>([]);
  let selectionState = $state<TrackedAnnotation | null>(null);
  let editingId = $state<string | null>(null);

  // Get scoped API for this document
  const annotationProvides = $derived(
    annotationCapability.provides
      ? annotationCapability.provides.forDocument(annotationsProps.documentId)
      : null,
  );

  // subscribe to annotation state
  $effect(() => {
    if (!annotationProvides) return;

    // Initialize with current state immediately
    const currentState = annotationProvides.getState();
    annotations = getAnnotationsByPageIndex(currentState, annotationsProps.pageIndex);
    selectionState = getSelectedAnnotationByPageIndex(currentState, annotationsProps.pageIndex);

    // Then subscribe to changes
    const off = annotationProvides.onStateChange((state) => {
      annotations = getAnnotationsByPageIndex(state, annotationsProps.pageIndex);
      selectionState = getSelectedAnnotationByPageIndex(state, annotationsProps.pageIndex);
    });
    return () => off?.();
  });

  // pointer handlers (capture-down to deselect when clicking empty layer)
  const handlers: PointerEventHandlersWithLifecycle = {
    onPointerDown: (_: unknown, pe: PointerEvent) => {
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
      annotationProvides.selectAnnotation(annotationsProps.pageIndex, annotation.object.id);
      selectionCapability.provides.clear();
      if (annotation.object.id !== editingId) {
        editingId = null;
      }
    }
  }

  function handleDoubleClick(e: MouseEvent | TouchEvent, id: string) {
    if (isReadOnly) return;
    if (isFreeText(annotations.find((a) => a.object.id === id)!)) {
      editingId = id;
    }
  }
</script>

{#each annotations as annotation (annotation.object.id)}
  {@const isSelected = selectionState?.object.id === annotation.object.id}
  {@const isEditing = editingId === annotation.object.id}
  {@const tool = annotationProvides?.findToolForAnnotation(annotation.object)}
  {@const mixBlendMode = blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal)}

  {#if isInk(annotation)}
    <AnnotationContainer
      trackedAnnotation={annotation}
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? false)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? false)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? false)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? false)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      onSelect={(e: MouseEvent | TouchEvent) => handleClick(e, annotation)}
      zIndex={0}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      {isSelected}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true) && !isEditing}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
      onSelect={(e) => handleClick(e, annotation)}
      style="mix-blend-mode: {blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal)}"
      onDoubleClick={(e) => {
        if (isReadOnly) return;
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
      {isSelected}
      isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
      isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
      lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
      selectionMenu={annotationsProps.selectionMenu}
      selectionMenuSnippet={annotationsProps.selectionMenuSnippet}
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
  {/if}
{/each}

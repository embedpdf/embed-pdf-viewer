<template>
  <template v-for="annotation in annotations" :key="annotation.object.id">
    <!-- Ink -->
    <AnnotationContainer
      v-if="isInk(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Ink
          v-bind="currentObject"
          :isSelected="selectionState?.object.id === annotation.object.id"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Square -->
    <AnnotationContainer
      v-else-if="isSquare(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Square
          v-bind="currentObject"
          :isSelected="selectionState?.object.id === annotation.object.id"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Circle -->
    <AnnotationContainer
      v-else-if="isCircle(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Circle
          v-bind="currentObject"
          :isSelected="selectionState?.object.id === annotation.object.id"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Line -->
    <AnnotationContainer
      v-else-if="isLine(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Line
          v-bind="currentObject"
          :isSelected="selectionState?.object.id === annotation.object.id"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Polyline -->
    <AnnotationContainer
      v-else-if="isPolyline(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Polyline
          v-bind="currentObject"
          :isSelected="selectionState?.object.id === annotation.object.id"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Polygon -->
    <AnnotationContainer
      v-else-if="isPolygon(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Polygon
          v-bind="currentObject"
          :isSelected="selectionState?.object.id === annotation.object.id"
          :scale="scale"
          :onClick="(e: PointerEvent | TouchEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- FreeText -->
    <AnnotationContainer
      v-else-if="isFreeText(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :onDoubleClick="(e) => handleDoubleClick(e, annotation.object.id)"
      :vertexConfig="getVertexConfig(annotation)"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.FreeText
          :isSelected="selectionState?.object.id === annotation.object.id"
          :isEditing="editingId === annotation.object.id"
          :annotation="{ ...annotation, object: currentObject }"
          :pageIndex="pageIndex"
          :scale="scale"
          :onClick="(e: PointerEvent | TouchEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Stamp -->
    <AnnotationContainer
      v-else-if="isStamp(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default>
        <AnnoComponents.Stamp
          :documentId="documentId"
          :isSelected="selectionState?.object.id === annotation.object.id"
          :annotation="annotation"
          :pageIndex="pageIndex"
          :scale="scale"
          :onClick="(e: PointerEvent | TouchEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Text Markup: Underline, StrikeOut, Squiggly, Highlight -->
    <AnnotationContainer
      v-else-if="isUnderline(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :zIndex="0"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <TextMarkupComponents.Underline
          v-bind="currentObject"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <AnnotationContainer
      v-else-if="isStrikeout(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :zIndex="0"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <TextMarkupComponents.Strikeout
          v-bind="currentObject"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <AnnotationContainer
      v-else-if="isSquiggly(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :zIndex="0"
      :style="{ mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal) }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <TextMarkupComponents.Squiggly
          v-bind="currentObject"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <AnnotationContainer
      v-else-if="isHighlight(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="selectionState?.object.id === annotation.object.id"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :zIndex="0"
      :style="{
        mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Multiply),
      }"
      v-bind="props"
    >
      <template #default="{ annotation: currentObject }">
        <TextMarkupComponents.Highlight
          v-bind="currentObject"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
    </AnnotationContainer>
  </template>
</template>

<script setup lang="ts">
import { ref, watchEffect, computed } from 'vue';
import { blendModeToCss, PdfBlendMode, Position } from '@embedpdf/models';
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
  TrackedAnnotation,
} from '@embedpdf/plugin-annotation';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/vue';
import { useSelectionCapability } from '@embedpdf/plugin-selection/vue';
import { useCoreState } from '@embedpdf/core/vue';
import { useAnnotationCapability } from '../hooks';
import AnnotationContainer from './annotation-container.vue';
import * as AnnoComponents from './annotations';
import * as TextMarkupComponents from './text-markup';
import { VertexConfig } from '../../shared/types';
import { AnnotationSelectionMenuRenderFn, ResizeHandleUI, VertexHandleUI } from '../types';

const props = defineProps<{
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  resizeUI?: ResizeHandleUI;
  vertexUI?: VertexHandleUI;
  selectionOutlineColor?: string;
  /** Render function for selection menu (schema-driven approach) */
  selectionMenu?: AnnotationSelectionMenuRenderFn;
}>();

const { provides: annotationCapability } = useAnnotationCapability();
const { provides: selectionProvides } = useSelectionCapability();
const annotations = ref<TrackedAnnotation[]>([]);
const { register } = usePointerHandlers({
  documentId: () => props.documentId,
  pageIndex: props.pageIndex,
});
const selectionState = ref<TrackedAnnotation | null>(null);
const editingId = ref<string | null>(null);

// Get scoped API for this document
const annotationProvides = computed(() =>
  annotationCapability.value ? annotationCapability.value.forDocument(props.documentId) : null,
);

watchEffect((onCleanup) => {
  if (annotationProvides.value) {
    // Initialize with current state immediately (like React)
    const currentState = annotationProvides.value.getState();
    annotations.value = getAnnotationsByPageIndex(currentState, props.pageIndex);
    selectionState.value = getSelectedAnnotationByPageIndex(currentState, props.pageIndex);

    // Then subscribe to changes
    const off = annotationProvides.value.onStateChange((state) => {
      annotations.value = getAnnotationsByPageIndex(state, props.pageIndex);
      selectionState.value = getSelectedAnnotationByPageIndex(state, props.pageIndex);
    });
    onCleanup(off);
  }
});

const handlePointerDown = (_pos: Position, pe: PointerEvent) => {
  if (pe.target === pe.currentTarget && annotationProvides.value) {
    annotationProvides.value.deselectAnnotation();
    editingId.value = null;
  }
};

const handleClick = (e: MouseEvent | TouchEvent, annotation: TrackedAnnotation) => {
  e.stopPropagation();
  if (annotationProvides.value && selectionProvides.value) {
    annotationProvides.value.selectAnnotation(props.pageIndex, annotation.object.id);
    selectionProvides.value.clear();
    if (annotation.object.id !== editingId.value) {
      editingId.value = null;
    }
  }
};

const handleDoubleClick = (_e: MouseEvent | PointerEvent, id: string) => {
  if (isReadOnly.value) return;
  if (isFreeText(annotations.value.find((a) => a.object.id === id)!)) {
    editingId.value = id;
  }
};

watchEffect((onCleanup) => {
  if (annotationProvides.value) {
    const unregister = register({ onPointerDown: handlePointerDown });
    if (unregister) {
      onCleanup(unregister);
    }
  }
});

// --- Component Logic ---
const coreState = useCoreState();
const isReadOnly = computed(
  () => coreState.value?.documents[props.documentId]?.readOnly === true,
);

const getTool = (annotation: TrackedAnnotation) =>
  annotationProvides.value?.findToolForAnnotation(annotation.object);

const isDraggable = (anno: TrackedAnnotation) => {
  if (isReadOnly.value) return false;
  if (isFreeText(anno) && editingId.value === anno.object.id) return false;
  return getTool(anno)?.interaction.isDraggable ?? false;
};
const isResizable = (anno: TrackedAnnotation) => {
  if (isReadOnly.value) return false;
  return getTool(anno)?.interaction.isResizable ?? false;
};
const lockAspectRatio = (anno: TrackedAnnotation) =>
  getTool(anno)?.interaction.lockAspectRatio ?? false;

const getVertexConfig = (annotation: TrackedAnnotation): VertexConfig<any> | undefined => {
  if (isLine(annotation)) {
    return {
      extractVertices: (anno) => [anno.linePoints.start, anno.linePoints.end],
      transformAnnotation: (anno, vertices) => ({
        ...anno,
        linePoints: { start: vertices[0], end: vertices[1] },
      }),
    };
  }
  if (isPolyline(annotation) || isPolygon(annotation)) {
    return {
      extractVertices: (anno) => anno.vertices,
      transformAnnotation: (anno, vertices) => ({ ...anno, vertices }),
    };
  }
  return undefined;
};
</script>

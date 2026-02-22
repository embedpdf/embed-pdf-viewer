<template>
  <template v-for="annotation in annotations" :key="annotation.object.id">
    <!-- Custom Renderer (from external plugins like redaction) -->
    <AnnotationContainer
      v-if="findCustomRenderer(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, false)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default>
        <component
          :is="findCustomRenderer(annotation)!.component"
          :annotation="annotation"
          :isSelected="isSelected(annotation)"
          :scale="scale"
          :pageIndex="pageIndex"
          :onClick="(e: PointerEvent | TouchEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Ink -->
    <AnnotationContainer
      v-else-if="isInk(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, true)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Ink
          v-bind="currentObject"
          :isSelected="isSelected(annotation)"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Square -->
    <AnnotationContainer
      v-else-if="isSquare(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, true)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Square
          v-bind="currentObject"
          :isSelected="isSelected(annotation)"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Circle -->
    <AnnotationContainer
      v-else-if="isCircle(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, true)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Circle
          v-bind="currentObject"
          :isSelected="isSelected(annotation)"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Line -->
    <AnnotationContainer
      v-else-if="isLine(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, true)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Line
          v-bind="currentObject"
          :isSelected="isSelected(annotation)"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Polyline -->
    <AnnotationContainer
      v-else-if="isPolyline(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, true)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Polyline
          v-bind="currentObject"
          :isSelected="isSelected(annotation)"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Polygon -->
    <AnnotationContainer
      v-else-if="isPolygon(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, true)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Polygon
          v-bind="currentObject"
          :isSelected="isSelected(annotation)"
          :scale="scale"
          :onClick="(e: PointerEvent | TouchEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- FreeText -->
    <AnnotationContainer
      v-else-if="isFreeText(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, true)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :onDoubleClick="(e) => handleDoubleClick(e, annotation.object.id)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.FreeText
          :isSelected="isSelected(annotation)"
          :isEditing="editingId === annotation.object.id"
          :annotation="{ ...annotation, object: currentObject }"
          :pageIndex="pageIndex"
          :scale="scale"
          :onClick="(e: PointerEvent | TouchEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Stamp -->
    <AnnotationContainer
      v-else-if="isStamp(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, true)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default>
        <AnnoComponents.Stamp
          :documentId="documentId"
          :isSelected="isSelected(annotation)"
          :annotation="annotation"
          :pageIndex="pageIndex"
          :scale="scale"
          :onClick="(e: PointerEvent | TouchEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps" />
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Text Markup: Underline, StrikeOut, Squiggly, Highlight -->
    <AnnotationContainer
      v-else-if="isUnderline(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, false)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :zIndex="0"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <TextMarkupComponents.Underline
          v-bind="currentObject"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <AnnotationContainer
      v-else-if="isStrikeout(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, false)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :zIndex="0"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <TextMarkupComponents.Strikeout
          v-bind="currentObject"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <AnnotationContainer
      v-else-if="isSquiggly(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, false)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :zIndex="0"
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <TextMarkupComponents.Squiggly
          v-bind="currentObject"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <AnnotationContainer
      v-else-if="isHighlight(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isDraggable="isDraggable(annotation)"
      :isResizable="isResizable(annotation)"
      :isRotatable="isRotatableFor(annotation, false)"
      :lockAspectRatio="lockAspectRatio(annotation)"
      :onSelect="(e) => handleClick(e, annotation)"
      :vertexConfig="getVertexConfig(annotation)"
      :selectionMenu="isMultiSelected ? undefined : selectionMenu"
      :zIndex="0"
      :style="blendStyle(annotation, PdfBlendMode.Multiply)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <TextMarkupComponents.Highlight
          v-bind="currentObject"
          :scale="scale"
          :onClick="(e: MouseEvent) => handleClick(e, annotation)"
        />
      </template>
      <template #selection-menu="slotProps" v-if="!isMultiSelected">
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
    </AnnotationContainer>

    <!-- Link -->
    <AnnotationContainer
      v-else-if="isLink(annotation)"
      :trackedAnnotation="annotation"
      :isSelected="showIndividualSelection(annotation)"
      :isMultiSelected="isMultiSelected"
      :isDraggable="false"
      :isResizable="false"
      :isRotatable="false"
      :lockAspectRatio="false"
      :onSelect="(e) => handleLinkClick(e, annotation)"
      :selectionMenu="
        annotation.object.inReplyToId ? undefined : isMultiSelected ? undefined : selectionMenu
      "
      :style="blendStyle(annotation)"
      v-bind="containerProps"
    >
      <template #default="{ annotation: currentObject }">
        <AnnoComponents.Link
          v-bind="currentObject"
          :isSelected="isSelected(annotation)"
          :scale="scale"
          :onClick="(e: MouseEvent | TouchEvent) => handleLinkClick(e, annotation)"
          :hasIRT="!!annotation.object.inReplyToId"
        />
      </template>
      <template
        #selection-menu="slotProps"
        v-if="!isMultiSelected && !annotation.object.inReplyToId"
      >
        <slot name="selection-menu" v-bind="slotProps" />
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps" />
      </template>
    </AnnotationContainer>
  </template>

  <!-- Group Selection Box (shown when multiple annotations are selected on this page) -->
  <GroupSelectionBox
    v-if="allSelectedOnSamePage && selectedAnnotationsOnPage.length >= 2"
    :documentId="documentId"
    :pageIndex="pageIndex"
    :scale="scale"
    :rotation="rotation"
    :pageWidth="pageWidth"
    :pageHeight="pageHeight"
    :selectedAnnotations="selectedAnnotationsOnPage"
    :isDraggable="areAllSelectedDraggable"
    :isResizable="areAllSelectedResizable"
    :isRotatable="areAllSelectedRotatable"
    :lockAspectRatio="shouldLockGroupAspectRatio"
    :resizeUi="resizeUi"
    :rotationUi="rotationUi"
    :selectionOutlineColor="selectionOutlineColor"
    :selectionOutline="groupSelectionOutline ?? selectionOutline"
    :groupSelectionMenu="groupSelectionMenu"
  >
    <template #group-selection-menu="slotProps">
      <slot name="group-selection-menu" v-bind="slotProps" />
    </template>
    <template #resize-handle="slotProps">
      <slot name="resize-handle" v-bind="slotProps" />
    </template>
    <template #rotation-handle="slotProps">
      <slot name="rotation-handle" v-bind="slotProps" />
    </template>
  </GroupSelectionBox>
</template>

<script setup lang="ts">
import { ref, watchEffect, computed, type CSSProperties } from 'vue';
import { blendModeToCss, PdfBlendMode, Position } from '@embedpdf/models';
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
  TrackedAnnotation,
  resolveInteractionProp,
} from '@embedpdf/plugin-annotation';
import type { PdfLinkAnnoObject } from '@embedpdf/models';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/vue';
import type { EmbedPdfPointerEvent } from '@embedpdf/plugin-interaction-manager';
import { useSelectionCapability } from '@embedpdf/plugin-selection/vue';
import { useAnnotationCapability } from '../hooks';
import AnnotationContainer from './annotation-container.vue';
import GroupSelectionBox from './group-selection-box.vue';
import * as AnnoComponents from './annotations';
import * as TextMarkupComponents from './text-markup';
import { VertexConfig } from '../../shared/types';
import {
  AnnotationSelectionMenuRenderFn,
  GroupSelectionMenuRenderFn,
  ResizeHandleUI,
  VertexHandleUI,
  RotationHandleUI,
  SelectionOutline,
} from '../types';
import type { BoxedAnnotationRenderer } from '../context';

const props = defineProps<{
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  resizeUi?: ResizeHandleUI;
  vertexUi?: VertexHandleUI;
  rotationUi?: RotationHandleUI;
  selectionOutlineColor?: string;
  selectionOutline?: SelectionOutline;
  groupSelectionOutline?: SelectionOutline;
  /** Render function for selection menu (schema-driven approach) */
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  /** Render function for group selection menu (schema-driven approach) */
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
  /** Custom renderers for specific annotation types (provided by external plugins) */
  annotationRenderers?: BoxedAnnotationRenderer[];
}>();

// Typed helper to avoid inline CSS objects in template (prevents TS2742 csstype errors in .d.ts output)
const blendStyle = (
  annotation: TrackedAnnotation,
  defaultBlend = PdfBlendMode.Normal,
): CSSProperties => ({
  mixBlendMode: blendModeToCss(annotation.object.blendMode ?? defaultBlend),
});

// Find a custom renderer for the given annotation
const findCustomRenderer = (annotation: TrackedAnnotation) => {
  return props.annotationRenderers?.find((r) => r.matches(annotation.object));
};

const { provides: annotationCapability } = useAnnotationCapability();
const { provides: selectionProvides } = useSelectionCapability();
const annotations = ref<TrackedAnnotation[]>([]);
const allSelectedIds = ref<string[]>([]);
const { register } = usePointerHandlers({
  documentId: () => props.documentId,
  pageIndex: props.pageIndex,
});
const editingId = ref<string | null>(null);

// Get scoped API for this document
const annotationProvides = computed(() =>
  annotationCapability.value ? annotationCapability.value.forDocument(props.documentId) : null,
);

// Check if multiple annotations are selected
const isMultiSelected = computed(() => allSelectedIds.value.length > 1);

watchEffect((onCleanup) => {
  if (annotationProvides.value) {
    // Initialize with current state immediately (like React)
    const currentState = annotationProvides.value.getState();
    annotations.value = getAnnotationsByPageIndex(currentState, props.pageIndex);
    allSelectedIds.value = getSelectedAnnotationIds(currentState);

    // Then subscribe to changes
    const off = annotationProvides.value.onStateChange((state) => {
      annotations.value = getAnnotationsByPageIndex(state, props.pageIndex);
      allSelectedIds.value = getSelectedAnnotationIds(state);
    });
    onCleanup(off);
  }
});

const handlePointerDown = (_pos: Position, pe: EmbedPdfPointerEvent<PointerEvent>) => {
  if (pe.target === pe.currentTarget && annotationProvides.value) {
    annotationProvides.value.deselectAnnotation();
    editingId.value = null;
  }
};

const handleClick = (e: MouseEvent | TouchEvent, annotation: TrackedAnnotation) => {
  e.stopPropagation();
  if (annotationProvides.value && selectionProvides.value) {
    selectionProvides.value.clear();

    // Check for modifier key (Cmd on Mac, Ctrl on Windows/Linux)
    const isModifierPressed = 'metaKey' in e ? e.metaKey || e.ctrlKey : false;

    if (isModifierPressed) {
      // Toggle selection: add or remove from current selection
      annotationProvides.value.toggleSelection(props.pageIndex, annotation.object.id);
    } else {
      // Exclusive select: clear and select only this one
      annotationProvides.value.selectAnnotation(props.pageIndex, annotation.object.id);
    }

    if (annotation.object.id !== editingId.value) {
      editingId.value = null;
    }
  }
};

// Special handler for link annotations - if IRT exists, select the parent
const handleLinkClick = (
  e: MouseEvent | TouchEvent,
  annotation: TrackedAnnotation<PdfLinkAnnoObject>,
) => {
  e.stopPropagation();
  if (!annotationProvides.value || !selectionProvides.value) return;

  selectionProvides.value.clear();

  // If link has IRT, select the parent annotation instead
  if (annotation.object.inReplyToId) {
    const parentId = annotation.object.inReplyToId;
    const parent = annotations.value.find((a) => a.object.id === parentId);
    if (parent) {
      annotationProvides.value.selectAnnotation(parent.object.pageIndex, parentId);
      return;
    }
  }

  // Standalone link - select it directly
  annotationProvides.value.selectAnnotation(props.pageIndex, annotation.object.id);
};

const handleDoubleClick = (_e: MouseEvent | PointerEvent, id: string) => {
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

// Check if an annotation is selected
const isSelected = (annotation: TrackedAnnotation) =>
  allSelectedIds.value.includes(annotation.object.id);

// Get selected annotations that are on THIS page (for group selection box)
const selectedAnnotationsOnPage = computed(() =>
  annotations.value.filter((anno) => allSelectedIds.value.includes(anno.object.id)),
);

// Check if all selected annotations on this page are draggable in group context
const areAllSelectedDraggable = computed(() => {
  if (selectedAnnotationsOnPage.value.length < 2) return false;

  return selectedAnnotationsOnPage.value.every((ta) => {
    const tool = annotationProvides.value?.findToolForAnnotation(ta.object);
    // Use group-specific property, falling back to single-annotation property
    const groupDraggable = resolveInteractionProp(
      tool?.interaction.isGroupDraggable,
      ta.object,
      true,
    );
    const singleDraggable = resolveInteractionProp(tool?.interaction.isDraggable, ta.object, true);
    return tool?.interaction.isGroupDraggable !== undefined ? groupDraggable : singleDraggable;
  });
});

// Check if all selected annotations on this page are resizable in group context
const areAllSelectedResizable = computed(() => {
  if (selectedAnnotationsOnPage.value.length < 2) return false;

  return selectedAnnotationsOnPage.value.every((ta) => {
    const tool = annotationProvides.value?.findToolForAnnotation(ta.object);
    // Use group-specific property, falling back to single-annotation property
    const groupResizable = resolveInteractionProp(
      tool?.interaction.isGroupResizable,
      ta.object,
      true,
    );
    const singleResizable = resolveInteractionProp(tool?.interaction.isResizable, ta.object, true);
    return tool?.interaction.isGroupResizable !== undefined ? groupResizable : singleResizable;
  });
});

// Check if all selected annotations on this page are rotatable in group context
const areAllSelectedRotatable = computed(() => {
  if (selectedAnnotationsOnPage.value.length < 2) return false;

  return selectedAnnotationsOnPage.value.every((ta) => {
    const tool = annotationProvides.value?.findToolForAnnotation(ta.object);
    const groupRotatable = resolveInteractionProp(
      tool?.interaction.isGroupRotatable,
      ta.object,
      true,
    );
    const singleRotatable = resolveInteractionProp(tool?.interaction.isRotatable, ta.object, true);
    return tool?.interaction.isGroupRotatable !== undefined ? groupRotatable : singleRotatable;
  });
});

// Check if any selected annotation on this page needs aspect ratio locked during group resize
const shouldLockGroupAspectRatio = computed(() => {
  if (selectedAnnotationsOnPage.value.length < 2) return false;

  return selectedAnnotationsOnPage.value.some((ta) => {
    const tool = annotationProvides.value?.findToolForAnnotation(ta.object);
    const groupLock = resolveInteractionProp(
      tool?.interaction.lockGroupAspectRatio,
      ta.object,
      false,
    );
    const singleLock = resolveInteractionProp(tool?.interaction.lockAspectRatio, ta.object, false);
    return tool?.interaction.lockGroupAspectRatio !== undefined ? groupLock : singleLock;
  });
});

// Check if all selected annotations are on the same page (this page)
const allSelectedOnSamePage = computed(() => {
  if (!annotationProvides.value) return false;
  // Early return if not enough selections (also creates reactive dependency on allSelectedIds)
  if (allSelectedIds.value.length < 2) return false;
  const allSelected = annotationProvides.value.getSelectedAnnotations();
  // All selected must be on this page
  return allSelected.every((ta) => ta.object.pageIndex === props.pageIndex);
});

// --- Component Logic ---
const getTool = (annotation: TrackedAnnotation) =>
  annotationProvides.value?.findToolForAnnotation(annotation.object);

const isDraggable = (anno: TrackedAnnotation) => {
  if (isFreeText(anno) && editingId.value === anno.object.id) return false;
  if (isMultiSelected.value) return false;
  return resolveInteractionProp(getTool(anno)?.interaction.isDraggable, anno.object, false);
};
const isResizable = (anno: TrackedAnnotation) => {
  if (isMultiSelected.value) return false;
  return resolveInteractionProp(getTool(anno)?.interaction.isResizable, anno.object, false);
};
const lockAspectRatio = (anno: TrackedAnnotation) =>
  resolveInteractionProp(getTool(anno)?.interaction.lockAspectRatio, anno.object, false);
const isRotatableFor = (anno: TrackedAnnotation, fallback: boolean) => {
  if (isMultiSelected.value) return false;
  return resolveInteractionProp(getTool(anno)?.interaction.isRotatable, anno.object, fallback);
};

// Should show individual selection UI (not when multi-selected)
const showIndividualSelection = (anno: TrackedAnnotation) =>
  isSelected(anno) && !isMultiSelected.value;

// Props to pass to AnnotationContainer (excluding props that are handled explicitly or are group-only)
const containerProps = computed(() => {
  const {
    selectionMenu: _sm,
    groupSelectionMenu: _gsm,
    groupSelectionOutline: _gso,
    ...rest
  } = props;
  return rest;
});

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

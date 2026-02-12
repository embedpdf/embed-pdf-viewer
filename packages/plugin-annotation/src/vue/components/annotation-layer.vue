<template>
  <div>
    <Annotations
      :documentId="documentId"
      :pageIndex="pageIndex"
      :scale="actualScale"
      :rotation="actualRotation"
      :pageWidth="pageWidth"
      :pageHeight="pageHeight"
      :resizeUI="resizeUI"
      :vertexUI="vertexUI"
      :rotationUI="rotationUI"
      :selectionOutlineColor="selectionOutlineColor"
      :selectionOutline="selectionOutline"
      :groupSelectionOutline="groupSelectionOutline"
      :selectionMenu="selectionMenu"
      :groupSelectionMenu="groupSelectionMenu"
      :annotationRenderers="allRenderers"
    >
      <!-- Forward slots for manual customization (only used if selectionMenu prop not provided) -->
      <template #selection-menu="slotProps">
        <slot name="selection-menu" v-bind="slotProps"></slot>
      </template>
      <template #group-selection-menu="slotProps">
        <slot name="group-selection-menu" v-bind="slotProps"></slot>
      </template>
      <template #resize-handle="slotProps">
        <slot name="resize-handle" v-bind="slotProps"></slot>
      </template>
      <template #vertex-handle="slotProps">
        <slot name="vertex-handle" v-bind="slotProps"></slot>
      </template>
      <template #rotation-handle="slotProps">
        <slot name="rotation-handle" v-bind="slotProps"></slot>
      </template>
    </Annotations>
    <TextMarkup :documentId="documentId" :pageIndex="pageIndex" :scale="actualScale" />
    <AnnotationPaintLayer :documentId="documentId" :pageIndex="pageIndex" :scale="actualScale" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import { Rotation } from '@embedpdf/models';
import Annotations from './annotations.vue';
import TextMarkup from './text-markup.vue';
import AnnotationPaintLayer from './annotation-paint-layer.vue';
import {
  AnnotationSelectionMenuRenderFn,
  GroupSelectionMenuRenderFn,
  ResizeHandleUI,
  VertexHandleUI,
  RotationHandleUI,
  SelectionOutline,
} from '../types';
import { useRendererRegistry, type BoxedAnnotationRenderer } from '../context';

const props = defineProps<{
  /** The ID of the document that this layer displays annotations for */
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: number;
  /** Customize resize handles */
  resizeUI?: ResizeHandleUI;
  /** Customize vertex handles */
  vertexUI?: VertexHandleUI;
  /** Customize rotation handle */
  rotationUI?: RotationHandleUI;
  /** @deprecated Use `selectionOutline` instead */
  selectionOutlineColor?: string;
  /** Customize the selection outline for individual annotations */
  selectionOutline?: SelectionOutline;
  /** Customize the selection outline for the group selection box (falls back to selectionOutline) */
  groupSelectionOutline?: SelectionOutline;
  /** Customize selection menu */
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  /** Customize group selection menu */
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
  /** Custom renderers for specific annotation types (provided by external plugins) */
  annotationRenderers?: BoxedAnnotationRenderer[];
}>();

// Get renderers from registry (provided by parent)
const registry = useRendererRegistry();

// Merge: registry + explicit props (props take precedence by id)
const allRenderers = computed(() => {
  const fromRegistry = registry?.getAll() ?? [];
  const fromProps = props.annotationRenderers ?? [];
  const merged = [...fromRegistry];
  for (const r of fromProps) {
    const idx = merged.findIndex((m) => m.id === r.id);
    if (idx >= 0) merged[idx] = r;
    else merged.push(r);
  }
  return merged;
});

const documentState = useDocumentState(() => props.documentId);
const page = computed(() => documentState.value?.document?.pages?.[props.pageIndex]);
const pageWidth = computed(() => page.value?.size?.width ?? 0);
const pageHeight = computed(() => page.value?.size?.height ?? 0);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

const actualRotation = computed(() => {
  if (props.rotation !== undefined) return props.rotation;
  // Combine page intrinsic rotation with document rotation
  const pageRotation = page.value?.rotation ?? 0;
  const docRotation = documentState.value?.rotation ?? 0;
  return ((pageRotation + docRotation) % 4) as Rotation;
});
</script>

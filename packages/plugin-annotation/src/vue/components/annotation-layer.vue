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
      :selectionOutlineColor="selectionOutlineColor"
      :selectionMenu="selectionMenu"
      :groupSelectionMenu="groupSelectionMenu"
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
} from '../types';

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
  /** Customize selection outline color */
  selectionOutlineColor?: string;
  /** Customize selection menu */
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  /** Customize group selection menu */
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
}>();

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
  return documentState.value?.rotation ?? Rotation.Degree0;
});
</script>

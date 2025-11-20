<template>
  <span v-bind="menuWrapperProps" ref="anchorEl" />
  <div
    v-if="anchorEl"
    ref="popperRef"
    :style="{
      position: 'fixed',
      left: rect.origin.x + 'px',
      top: rect.origin.y + rect.size.height + 8 + 'px',
      zIndex: 1000,
    }"
    class="rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg"
  >
    <button
      @click="handleDelete"
      class="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600"
      aria-label="Delete annotation"
      title="Delete annotation"
    >
      <TrashIcon class="h-4 w-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Rect } from '@embedpdf/models';
import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useAnnotation, useAnnotationCapability } from '@embedpdf/plugin-annotation/vue';
import type { MenuWrapperProps } from '@embedpdf/utils/vue';
import { TrashIcon } from './icons';

const props = defineProps<{
  menuWrapperProps: MenuWrapperProps;
  selected: TrackedAnnotation;
  rect: Rect;
  documentId: string;
}>();

const { provides: annotationCapability } = useAnnotation(() => props.documentId);
const anchorEl = ref<HTMLSpanElement | null>(null);
const popperRef = ref<HTMLDivElement | null>(null);

const handleDelete = () => {
  if (!annotationCapability.value) return;
  const { pageIndex, id } = props.selected.object;
  annotationCapability.value.deleteAnnotation(pageIndex, id);
};
</script>

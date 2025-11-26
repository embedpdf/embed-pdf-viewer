<template>
  <div v-bind="menuWrapperProps">
    <div :style="menuStyle" class="rounded-lg border border-gray-200 bg-white shadow-lg">
      <div class="flex items-center gap-1 px-2 py-1">
        <button
          @click="handleDelete"
          class="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600"
          aria-label="Delete annotation"
          title="Delete annotation"
        >
          <TrashIcon class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import type { Rect } from '@embedpdf/models';
import type {
  AnnotationSelectionContext,
  AnnotationSelectionMenuProps,
} from '@embedpdf/plugin-annotation/vue';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/vue';
import TrashIcon from './icons/TrashIcon.vue';

const props = defineProps<{
  documentId: string;
  context: AnnotationSelectionContext;
  selected: boolean;
  rect: Rect;
  placement: AnnotationSelectionMenuProps['placement'];
  menuWrapperProps: AnnotationSelectionMenuProps['menuWrapperProps'];
}>();

const { provides: annotationCapability } = useAnnotationCapability();

const menuStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  pointerEvents: 'auto',
  cursor: 'default',
  top: `${props.rect.size.height + 8}px`,
}));

const handleDelete = () => {
  const annotationScope = annotationCapability.value?.forDocument(props.documentId);
  if (!annotationScope) return;

  const { pageIndex, id } = props.context.annotation.object;
  annotationScope.deleteAnnotation(pageIndex, id);
};
</script>

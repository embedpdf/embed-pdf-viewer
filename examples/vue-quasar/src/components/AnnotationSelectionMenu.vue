<script setup lang="ts">
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/vue';
import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import type { MenuWrapperProps } from '@embedpdf/utils/vue';
import type { Rect } from '@embedpdf/models';

interface AnnotationSelectionMenuProps {
  menuWrapperProps: MenuWrapperProps;
  annotation: TrackedAnnotation;
  rect: Rect;
}

const props = defineProps<AnnotationSelectionMenuProps>();

const { provides: annotation } = useAnnotationCapability();

const handleDelete = (e: Event) => {
  e.stopPropagation();
  const api = annotation.value;
  if (!api) return;
  const { pageIndex, id } = props.annotation.object;
  api.deleteAnnotation(pageIndex, id);
};
</script>

<template>
  <span v-bind="menuWrapperProps">
    <q-card
      flat
      bordered
      class="menu-card q-pa-xs"
      :style="{
        position: 'absolute',
        top: `${rect.size.height + 8}px`,
        left: '0',
        zIndex: 1000,
        cursor: 'default',
        pointerEvents: 'auto',
      }"
    >
      <div class="row items-center q-gutter-xs">
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="mdi-delete-outline"
          @click="handleDelete"
          aria-label="Delete annotation"
        />
      </div>
    </q-card>
  </span>
</template>

<style scoped>
.menu-card {
  min-width: 40px;
}
</style>

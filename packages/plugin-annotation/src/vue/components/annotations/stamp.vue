<template>
  <div
    :style="{
      position: 'absolute',
      width: '100%',
      height: '100%',
      zIndex: 2,
      pointerEvents: isSelected ? 'none' : 'auto',
      cursor: 'pointer',
    }"
    @pointerdown="onClick"
    @touchstart="onClick"
  >
    <RenderAnnotation
      :documentId="documentId"
      :pageIndex="pageIndex"
      :annotation="{ ...annotation.object, id: annotation.object.id }"
      :scaleFactor="scale"
    />
  </div>
</template>

<script setup lang="ts">
import { PdfStampAnnoObject } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import RenderAnnotation from '../render-annotation.vue';

defineProps<{
  isSelected: boolean;
  annotation: TrackedAnnotation<PdfStampAnnoObject>;
  documentId: string;
  pageIndex: number;
  scale: number;
  onClick: (e: PointerEvent | TouchEvent) => void;
}>();
</script>

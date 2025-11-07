<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import type { Rect } from '@embedpdf/models';
import { useSelectionPlugin } from '../hooks/use-selection';

interface SelectionLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
  background?: string;
}

const props = withDefaults(defineProps<SelectionLayerProps>(), {
  background: 'rgba(33,150,243)',
});

const { plugin: selPlugin } = useSelectionPlugin();
const documentState = useDocumentState(() => props.documentId);
const rects = ref<Rect[]>([]);
const boundingRect = ref<Rect | null>(null);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

watch(
  [() => selPlugin.value, () => props.documentId, () => props.pageIndex],
  ([plugin, docId, pageIdx], _, onCleanup) => {
    if (!plugin || !docId) {
      rects.value = [];
      boundingRect.value = null;
      return;
    }

    const unregister = plugin.registerSelectionOnPage({
      documentId: docId,
      pageIndex: pageIdx,
      onRectsChange: ({ rects: newRects, boundingRect: newBoundingRect }) => {
        rects.value = newRects;
        boundingRect.value = newBoundingRect;
      },
    });

    onCleanup(unregister);
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="boundingRect"
    :style="{
      position: 'absolute',
      left: `${boundingRect.origin.x * actualScale}px`,
      top: `${boundingRect.origin.y * actualScale}px`,
      width: `${boundingRect.size.width * actualScale}px`,
      height: `${boundingRect.size.height * actualScale}px`,
      mixBlendMode: 'multiply',
      isolation: 'isolate',
      pointerEvents: 'none',
    }"
  >
    <div
      v-for="(rect, i) in rects"
      :key="i"
      :style="{
        position: 'absolute',
        left: `${(rect.origin.x - boundingRect.origin.x) * actualScale}px`,
        top: `${(rect.origin.y - boundingRect.origin.y) * actualScale}px`,
        width: `${rect.size.width * actualScale}px`,
        height: `${rect.size.height * actualScale}px`,
        background: background,
      }"
    />
  </div>
</template>

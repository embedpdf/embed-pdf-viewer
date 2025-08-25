<template>
  <div
    v-if="boundingRect"
    :style="{
      position: 'absolute',
      left: `${boundingRect.origin.x * scale}px`,
      top: `${boundingRect.origin.y * scale}px`,
      width: `${boundingRect.size.width * scale}px`,
      height: `${boundingRect.size.height * scale}px`,
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
        left: `${(rect.origin.x - boundingRect.origin.x) * scale}px`,
        top: `${(rect.origin.y - boundingRect.origin.y) * scale}px`,
        width: `${rect.size.width * scale}px`,
        height: `${rect.size.height * scale}px`,
        background: background,
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Rect } from '@embedpdf/models';
import { useSelectionCapability } from '../hooks/use-selection';

interface Props {
  pageIndex: number;
  scale: number;
  background?: string;
}

const props = withDefaults(defineProps<Props>(), {
  background: 'rgba(33, 150, 243)',
});

const { provides: sel } = useSelectionCapability();
const rects = ref<Rect[]>([]);
const boundingRect = ref<Rect | null>(null);

let unregister: (() => void) | undefined;

onMounted(() => {
  if (!sel.value) return;

  unregister = sel.value.registerSelectionOnPage({
    pageIndex: props.pageIndex,
    onRectsChange: ({ rects: newRects, boundingRect: newBoundingRect }) => {
      rects.value = newRects;
      boundingRect.value = newBoundingRect;
    },
  });
});

onUnmounted(() => {
  unregister?.();
});
</script>

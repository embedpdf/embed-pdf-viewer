<template>
  <div
    v-if="rect"
    :style="{
      position: 'absolute',
      pointerEvents: 'none',
      left: `${rect.origin.x * scale}px`,
      top: `${rect.origin.y * scale}px`,
      width: `${rect.size.width * scale}px`,
      height: `${rect.size.height * scale}px`,
      border: `1px solid ${stroke}`,
      background: fill,
      boxSizing: 'border-box',
    }"
    :class="className"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Rect } from '@embedpdf/models';
import { useCaptureCapability } from '../hooks/use-capture';

interface MarqueeCaptureProps {
  /** Document ID */
  documentId: string;
  /** Index of the page this layer lives on */
  pageIndex: number;
  /** Scale of the page */
  scale: number;
  /** Optional CSS class applied to the marquee rectangle */
  className?: string;
  /** Stroke / fill colours (defaults below) */
  stroke?: string;
  fill?: string;
}

const props = withDefaults(defineProps<MarqueeCaptureProps>(), {
  stroke: 'rgba(33,150,243,0.8)',
  fill: 'rgba(33,150,243,0.15)',
});

const { provides: capturePlugin } = useCaptureCapability();
const rect = ref<Rect | null>(null);

let unregister: (() => void) | undefined;

onMounted(() => {
  if (!capturePlugin.value) return;

  unregister = capturePlugin.value.registerMarqueeOnPage({
    documentId: props.documentId,
    pageIndex: props.pageIndex,
    scale: props.scale,
    callback: {
      onPreview: (newRect) => {
        rect.value = newRect;
      },
    },
  });
});

onUnmounted(() => {
  unregister?.();
});
</script>

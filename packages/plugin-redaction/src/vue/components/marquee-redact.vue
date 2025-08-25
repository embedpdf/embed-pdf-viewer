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
import { useRedactionPlugin } from '../hooks/use-redaction';

interface MarqueeRedactProps {
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

const props = withDefaults(defineProps<MarqueeRedactProps>(), {
  stroke: 'red',
  fill: 'transparent',
});

const { plugin: redactionPlugin } = useRedactionPlugin();
const rect = ref<Rect | null>(null);

let unregister: (() => void) | undefined;

onMounted(() => {
  if (!redactionPlugin.value) return;

  unregister = redactionPlugin.value.registerMarqueeOnPage({
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

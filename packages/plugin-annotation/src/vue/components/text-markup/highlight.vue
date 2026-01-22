<template>
  <div
    v-for="(b, i) in segmentRects"
    :key="i"
    @pointerdown="onClick"
    @touchstart="onClick"
    :style="{
      position: 'absolute',
      left: `${(rect ? b.origin.x - rect.origin.x : b.origin.x) * scale}px`,
      top: `${(rect ? b.origin.y - rect.origin.y : b.origin.y) * scale}px`,
      width: `${b.size.width * scale}px`,
      height: `${b.size.height * scale}px`,
      background: resolvedColor,
      opacity: opacity,
      pointerEvents: onClick ? 'auto' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      zIndex: onClick ? 1 : undefined,
    }"
  ></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Rect } from '@embedpdf/models';

const props = withDefaults(
  defineProps<{
    /** Stroke/markup color */
    strokeColor?: string;
    opacity?: number;
    segmentRects: Rect[];
    rect?: Rect;
    scale: number;
    onClick?: (e: PointerEvent | TouchEvent) => void;
  }>(),
  {
    opacity: 0.5,
  },
);

const resolvedColor = computed(() => props.strokeColor ?? '#FFFF00');
</script>

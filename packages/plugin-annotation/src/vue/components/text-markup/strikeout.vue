<template>
  <div
    v-for="(r, i) in segmentRects"
    :key="i"
    @pointerdown="onClick"
    @touchstart="onClick"
    :style="{
      position: 'absolute',
      left: `${(rect ? r.origin.x - rect.origin.x : r.origin.x) * scale}px`,
      top: `${(rect ? r.origin.y - rect.origin.y : r.origin.y) * scale}px`,
      width: `${r.size.width * scale}px`,
      height: `${r.size.height * scale}px`,
      background: 'transparent',
      pointerEvents: onClick ? 'auto' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      zIndex: onClick ? 1 : 0,
    }"
  >
    <div
      :style="{
        position: 'absolute',
        left: 0,
        top: '50%',
        width: '100%',
        height: `${thickness}px`,
        background: resolvedColor,
        opacity: opacity,
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
      }"
    />
  </div>
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
const thickness = computed(() => 2 * props.scale);
</script>

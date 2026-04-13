<template>
  <div
    v-for="(b, i) in segmentRects"
    :key="i"
    @pointerdown="onClick"
    :style="{
      position: 'absolute',
      left: `${(rect ? b.origin.x - rect.origin.x : b.origin.x) * scale}px`,
      top: `${(rect ? b.origin.y - rect.origin.y : b.origin.y) * scale}px`,
      width: `${b.size.width * scale}px`,
      height: `${b.size.height * scale}px`,
      background: appearanceActive ? 'transparent' : resolvedColor,
      opacity: appearanceActive ? undefined : opacity,
      pointerEvents: onClick ? 'auto' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      zIndex: onClick ? 1 : undefined,
    }"
  ></div>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

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
    onClick?: (e: PointerEvent) => void;
    /** When true, AP image provides the visual; only render hit area */
    appearanceActive?: boolean;
  }>(),
  {
    opacity: 0.5,
    appearanceActive: false,
  },
);

const resolvedColor = computed(() => props.strokeColor ?? '#FFFF00');
</script>

<template>
  <svg
    :style="{
      position: 'absolute',
      width: `${width}px`,
      height: `${height}px`,
      pointerEvents: 'none',
      zIndex: 2,
      overflow: 'visible',
    }"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${rect.size.width} ${rect.size.height}`"
  >
    <path
      v-for="(d, i) in paths"
      :key="i"
      :d="d"
      fill="none"
      :opacity="opacity"
      @pointerdown="onClick"
      @touchstart="onClick"
      :style="{
        cursor: isSelected ? 'move' : 'pointer',
        pointerEvents: isSelected ? 'none' : 'visibleStroke',
        stroke: resolvedColor,
        strokeWidth: strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PdfInkListObject, Rect } from '@embedpdf/models';

const props = withDefaults(
  defineProps<{
    isSelected: boolean;
    /** Stroke color */
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    inkList: PdfInkListObject[];
    rect: Rect;
    scale: number;
    onClick?: (e: PointerEvent | TouchEvent) => void;
  }>(),
  {
    opacity: 1,
  },
);

const resolvedColor = computed(() => props.strokeColor ?? '#000000');

const paths = computed(() => {
  return props.inkList.map(({ points }) => {
    let d = '';
    points.forEach(({ x, y }, i) => {
      const lx = x - props.rect.origin.x;
      const ly = y - props.rect.origin.y;
      d += (i === 0 ? 'M' : 'L') + `${lx} ${ly} `;
    });
    return d.trim();
  });
});

const width = computed(() => props.rect.size.width * props.scale);
const height = computed(() => props.rect.size.height * props.scale);
</script>

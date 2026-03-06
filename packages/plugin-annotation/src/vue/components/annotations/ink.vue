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
    <!-- Hit area -- always rendered, transparent, wider stroke for mobile -->
    <path
      v-for="(d, i) in paths"
      :key="`hit-${i}`"
      :d="d"
      fill="none"
      stroke="transparent"
      :stroke-width="hitStrokeWidth"
      @pointerdown="onClick"
      :style="{
        cursor: isSelected ? 'move' : 'pointer',
        pointerEvents: isSelected ? 'none' : 'visibleStroke',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }"
    />
    <!-- Visual -- hidden when AP active, never interactive -->
    <template v-if="!appearanceActive">
      <path
        v-for="(d, i) in paths"
        :key="`vis-${i}`"
        :d="d"
        fill="none"
        :opacity="opacity"
        :style="{
          pointerEvents: 'none',
          stroke: resolvedColor,
          strokeWidth: strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }"
      />
    </template>
  </svg>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { PdfInkListObject, Rect } from '@embedpdf/models';

const MIN_HIT_AREA_SCREEN_PX = 20;

const props = withDefaults(
  defineProps<{
    isSelected: boolean;
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    inkList: PdfInkListObject[];
    rect: Rect;
    scale: number;
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
  }>(),
  {
    opacity: 1,
    appearanceActive: false,
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
const hitStrokeWidth = computed(() =>
  Math.max(props.strokeWidth, MIN_HIT_AREA_SCREEN_PX / props.scale),
);
</script>

<template>
  <svg
    :style="{
      position: 'absolute',
      width: svgWidth,
      height: svgHeight,
      pointerEvents: 'none',
      zIndex: 2,
    }"
    :width="svgWidth"
    :height="svgHeight"
    :viewBox="`0 0 ${width} ${height}`"
    overflow="visible"
  >
    <!-- Hit area -->
    <path
      :d="path"
      fill="transparent"
      stroke="transparent"
      :stroke-width="4"
      @pointerdown="onClick"
      :style="{
        cursor: isSelected ? 'move' : 'pointer',
        pointerEvents: isSelected ? 'none' : 'visible',
      }"
    />
    <!-- Visual -->
    <path
      v-if="!appearanceActive"
      :d="path"
      :fill="strokeColor"
      :stroke="strokeColor"
      :stroke-width="0.5"
      :opacity="opacity"
      fill-rule="evenodd"
      :style="{ pointerEvents: 'none' }"
    />
  </svg>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { Rect } from '@embedpdf/models';

const props = withDefaults(
  defineProps<{
    isSelected: boolean;
    strokeColor?: string;
    opacity?: number;
    rect: Rect;
    scale: number;
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
  }>(),
  {
    strokeColor: '#000000',
    opacity: 1,
    appearanceActive: false,
  },
);

const width = computed(() => props.rect.size.width);
const height = computed(() => props.rect.size.height);

const path = computed(() => {
  const w = width.value;
  const h = height.value;
  const midX = w / 2;

  return [
    `M 0 ${h}`,
    `C ${w * 0.27} ${h} ${midX} ${h - h * 0.44} ${midX} 0`,
    `C ${midX} ${h - h * 0.44} ${w - w * 0.27} ${h} ${w} ${h}`,
    'Z',
  ].join(' ');
});

const svgWidth = computed(() => width.value * props.scale);
const svgHeight = computed(() => height.value * props.scale);
</script>
